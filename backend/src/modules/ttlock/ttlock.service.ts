import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as crypto from 'crypto';
import { TtlockToken } from '../../entities/ttlock-token.entity';

interface TtlockAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

interface TtlockBaseResponse {
  errcode: number;
  errmsg: string;
  description?: string;
}

@Injectable()
export class TtlockService {
  private readonly logger = new Logger(TtlockService.name);

  constructor(
    @InjectRepository(TtlockToken)
    private readonly tokenRepo: Repository<TtlockToken>,
    private readonly configService: ConfigService,
  ) {}

  private get apiBase(): string {
    return this.configService.get<string>('ttlock.apiBase')!;
  }

  private get clientId(): string {
    return this.configService.get<string>('ttlock.clientId')!;
  }

  private get clientSecret(): string {
    return this.configService.get<string>('ttlock.clientSecret')!;
  }

  private get lockId(): number {
    return this.configService.get<number>('ttlock.lockId')!;
  }

  private get gatewayId(): number {
    return this.configService.get<number>('ttlock.gatewayId')!;
  }

  private get mockUnlock(): boolean {
    return this.configService.get<boolean>('ttlock.mockUnlock') ?? false;
  }

  private md5(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private nowMs(): number {
    return Date.now();
  }

  async onModuleInit() {
    try {
      await this.ensureAccessToken();
    } catch (err) {
      this.logger.warn(`TTLock token init skipped: ${(err as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async refreshTokenScheduled() {
    try {
      await this.ensureAccessToken();
    } catch (err) {
      this.logger.error(`TTLock token refresh failed: ${(err as Error).message}`);
    }
  }

  async ensureAccessToken(): Promise<string> {
    const existing = await this.tokenRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (existing && existing.expiresAt.getTime() > Date.now() + 60000) {
      return existing.accessToken;
    }

    if (existing?.refreshToken) {
      try {
        return await this.refreshAccessToken(existing);
      } catch {
        this.logger.warn('Refresh token failed, re-authenticating');
      }
    }

    return this.authenticate();
  }

  private async authenticate(): Promise<string> {
    const username = this.configService.get<string>('ttlock.username');
    const password = this.configService.get<string>('ttlock.password');

    if (!this.clientId || !username || !password) {
      throw new Error('TTLock credentials not configured');
    }

    const params = new URLSearchParams({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      username,
      password: this.md5(password),
      grant_type: 'password',
    });

    const { data } = await axios.post<TtlockAuthResponse>(
      `${this.apiBase}/oauth2/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || 'TTLock auth failed');
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const token = this.tokenRepo.create({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      lockId: this.lockId || undefined,
      gatewayId: this.gatewayId || undefined,
    });
    await this.tokenRepo.save(token);
    return data.access_token;
  }

  private async refreshAccessToken(existing: TtlockToken): Promise<string> {
    const params = new URLSearchParams({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken!,
    });

    const { data } = await axios.post<TtlockAuthResponse>(
      `${this.apiBase}/oauth2/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || 'TTLock refresh failed');
    }

    existing.accessToken = data.access_token;
    if (data.refresh_token) existing.refreshToken = data.refresh_token;
    existing.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.tokenRepo.save(existing);
    return existing.accessToken;
  }

  async unlock(): Promise<{ success: boolean; message: string }> {
    if (this.mockUnlock) {
      this.logger.log('Mock unlock success');
      return { success: true, message: '模拟开门成功' };
    }

    const accessToken = await this.ensureAccessToken();
    const lockId = this.lockId;
    if (!lockId) {
      return { success: false, message: '未配置锁ID' };
    }

    const params = new URLSearchParams({
      clientId: this.clientId,
      accessToken,
      lockId: String(lockId),
      date: String(this.nowMs()),
    });

    const { data } = await axios.post<TtlockBaseResponse>(
      `${this.apiBase}/v3/lock/unlock`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );

    if (data.errcode === 0) {
      return { success: true, message: '开门成功' };
    }
    return { success: false, message: data.errmsg || data.description || '开门失败' };
  }

  async createKeyboardPassword(
    startDate: Date,
    endDate: Date,
    keyboardPwdName: string,
  ): Promise<{ keyboardPwd: string; keyboardPwdId: number }> {
    if (this.mockUnlock) {
      const mockPwd = String(Math.floor(100000 + Math.random() * 900000));
      return { keyboardPwd: mockPwd, keyboardPwdId: Math.floor(Math.random() * 1000000) };
    }

    const accessToken = await this.ensureAccessToken();
    const lockId = this.lockId;
    if (!lockId) throw new Error('未配置锁ID');

    const params = new URLSearchParams({
      clientId: this.clientId,
      accessToken,
      lockId: String(lockId),
      keyboardPwdType: '3',
      keyboardPwdName,
      startDate: String(startDate.getTime()),
      endDate: String(endDate.getTime()),
      addType: '2',
      date: String(this.nowMs()),
    });

    const { data } = await axios.post<
      TtlockBaseResponse & { keyboardPwd?: string; keyboardPwdId?: number }
    >(
      `${this.apiBase}/v3/keyboardPwd/add`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );

    if (data.errcode !== 0 || !data.keyboardPwd) {
      throw new Error(data.errmsg || '生成密码失败');
    }

    return {
      keyboardPwd: data.keyboardPwd,
      keyboardPwdId: data.keyboardPwdId!,
    };
  }

  async listGatewayLocks(): Promise<unknown[]> {
    const accessToken = await this.ensureAccessToken();
    const gatewayId = this.gatewayId;
    if (!gatewayId) return [];

    const { data } = await axios.get<{ list?: unknown[]; errcode: number; errmsg: string }>(
      `${this.apiBase}/v3/gateway/listLock`,
      {
        params: {
          clientId: this.clientId,
          accessToken,
          gatewayId,
          date: this.nowMs(),
        },
      },
    );

    if (data.errcode !== 0) {
      throw new Error(data.errmsg || '获取锁列表失败');
    }
    return data.list || [];
  }
}
