import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as crypto from 'crypto';
import { TtlockToken } from '../../entities/ttlock-token.entity';
import { SettingsService } from '../settings/settings.service';
import { UpdateTtlockConfigDto } from './ttlock.dto';

interface TtlockAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  uid?: number;
  errcode?: number;
  errmsg?: string;
}

interface TtlockBaseResponse {
  errcode: number;
  errmsg: string;
  description?: string;
}

export interface TtlockRuntimeConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  apiBase: string;
  lockId: number;
  gatewayId: number;
  mockUnlock: boolean;
}

export interface TtlockAdminConfig extends Omit<TtlockRuntimeConfig, 'clientSecret' | 'password'> {
  clientSecret: string;
  password: string;
  hasClientSecret: boolean;
  hasPassword: boolean;
}

export interface TtlockGatewayItem {
  gatewayId: number;
  gatewayMac?: string;
  gatewayVersion?: number;
  networkName?: string;
  lockNum?: number;
  isOnline?: number;
}

export interface TtlockLockItem {
  lockId: number;
  lockName?: string;
  lockAlias?: string;
  lockMac?: string;
  electricQuantity?: number;
  hasGateway?: number;
}

const SECRET_MASK = '********';

const SETTING_KEYS = {
  clientId: 'ttlock_client_id',
  clientSecret: 'ttlock_client_secret',
  username: 'ttlock_username',
  password: 'ttlock_password',
  apiBase: 'ttlock_api_base',
  mockUnlock: 'ttlock_mock_unlock',
} as const;

@Injectable()
export class TtlockService {
  private readonly logger = new Logger(TtlockService.name);

  constructor(
    @InjectRepository(TtlockToken)
    private readonly tokenRepo: Repository<TtlockToken>,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  private md5(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private nowMs(): number {
    return Date.now();
  }

  /** 仅在显式开启 mock 时使用模拟；生产环境缺锁配置应明确失败 */
  private shouldUseMock(config: TtlockRuntimeConfig): boolean {
    return config.mockUnlock;
  }

  private assertLockConfigured(config: TtlockRuntimeConfig): void {
    if (config.mockUnlock) return;
    if (!config.lockId) {
      throw new Error('通通锁 Lock ID 未配置，请在 .env 中设置 TTLOCK_LOCK_ID');
    }
    if (!config.clientId || !config.username || !config.password) {
      throw new Error('通通锁凭证未配置完整');
    }
  }

  private mockKeyboardPassword(): { keyboardPwd: string; keyboardPwdId: number } {
    return {
      keyboardPwd: String(Math.floor(100000 + Math.random() * 900000)),
      keyboardPwdId: Math.floor(Math.random() * 1000000),
    };
  }

  private envDefaults(): TtlockRuntimeConfig {
    return {
      clientId: this.configService.get<string>('ttlock.clientId') || '',
      clientSecret: this.configService.get<string>('ttlock.clientSecret') || '',
      username: this.configService.get<string>('ttlock.username') || '',
      password: this.configService.get<string>('ttlock.password') || '',
      apiBase: this.configService.get<string>('ttlock.apiBase') || 'https://cnapi.ttlock.com',
      lockId: this.configService.get<number>('ttlock.lockId') || 0,
      gatewayId: this.configService.get<number>('ttlock.gatewayId') || 0,
      mockUnlock: this.configService.get<boolean>('ttlock.mockUnlock') ?? false,
    };
  }

  private async settingOrEnv(key: string, envValue: string): Promise<string> {
    const dbValue = await this.settingsService.get(key);
    if (dbValue !== undefined) return dbValue;
    return envValue;
  }

  async resolveConfig(): Promise<TtlockRuntimeConfig> {
    const env = this.envDefaults();
    const mockUnlockRaw = await this.settingOrEnv(
      SETTING_KEYS.mockUnlock,
      env.mockUnlock ? 'true' : 'false',
    );

    return {
      clientId: await this.settingOrEnv(SETTING_KEYS.clientId, env.clientId),
      clientSecret: await this.settingOrEnv(SETTING_KEYS.clientSecret, env.clientSecret),
      username: await this.settingOrEnv(SETTING_KEYS.username, env.username),
      password: await this.settingOrEnv(SETTING_KEYS.password, env.password),
      apiBase: await this.settingOrEnv(SETTING_KEYS.apiBase, env.apiBase),
      lockId: env.lockId,
      gatewayId: env.gatewayId,
      mockUnlock: mockUnlockRaw === 'true',
    };
  }

  async getAdminConfig(): Promise<TtlockAdminConfig> {
    const config = await this.resolveConfig();
    return {
      clientId: config.clientId,
      clientSecret: config.clientSecret ? SECRET_MASK : '',
      hasClientSecret: !!config.clientSecret,
      username: config.username,
      password: config.password ? SECRET_MASK : '',
      hasPassword: !!config.password,
      apiBase: config.apiBase,
      lockId: config.lockId,
      gatewayId: config.gatewayId,
      mockUnlock: config.mockUnlock,
    };
  }

  async saveAdminConfig(dto: UpdateTtlockConfigDto): Promise<TtlockAdminConfig> {
    if (dto.clientId !== undefined) {
      await this.settingsService.set(SETTING_KEYS.clientId, dto.clientId);
    }
    if (dto.clientSecret !== undefined && dto.clientSecret !== SECRET_MASK) {
      await this.settingsService.set(SETTING_KEYS.clientSecret, dto.clientSecret);
    }
    if (dto.username !== undefined) {
      await this.settingsService.set(SETTING_KEYS.username, dto.username);
    }
    if (dto.password !== undefined && dto.password !== SECRET_MASK) {
      await this.settingsService.set(SETTING_KEYS.password, dto.password);
    }
    if (dto.apiBase !== undefined) {
      await this.settingsService.set(SETTING_KEYS.apiBase, dto.apiBase);
    }
    if (dto.mockUnlock !== undefined) {
      await this.settingsService.set(SETTING_KEYS.mockUnlock, dto.mockUnlock ? 'true' : 'false');
    }

    await this.tokenRepo.clear();
    return this.getAdminConfig();
  }

  async getTokenStatus() {
    const existing = await this.tokenRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!existing) {
      return { hasToken: false, valid: false };
    }

    const valid = existing.expiresAt.getTime() > Date.now() + 60000;
    return {
      hasToken: true,
      valid,
      expiresAt: existing.expiresAt.toISOString(),
      accessTokenPreview: `${existing.accessToken.slice(0, 8)}...`,
    };
  }

  async testAuth(): Promise<{
    success: boolean;
    accessTokenPreview?: string;
    expiresIn?: number;
    expiresAt?: string;
    uid?: number;
    message?: string;
  }> {
    try {
      await this.tokenRepo.clear();
      const data = await this.authenticateWithResponse();
      const config = await this.resolveConfig();
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);
      const token = this.tokenRepo.create({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        lockId: config.lockId || undefined,
        gatewayId: config.gatewayId || undefined,
      });
      await this.tokenRepo.save(token);
      return {
        success: true,
        accessTokenPreview: `${data.access_token.slice(0, 8)}...`,
        expiresIn: data.expires_in,
        expiresAt: expiresAt.toISOString(),
        uid: data.uid,
      };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
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

  private ttlockApiFailed(errcode?: number): boolean {
    return errcode != null && errcode !== 0;
  }

  private async authenticateWithResponse(): Promise<TtlockAuthResponse> {
    const config = await this.resolveConfig();

    if (!config.clientId || !config.username || !config.password) {
      throw new Error('通通锁凭证未配置完整');
    }

    const params = new URLSearchParams({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      username: config.username,
      password: this.md5(config.password),
      grant_type: 'password',
    });

    const { data } = await axios.post<TtlockAuthResponse>(
      `${config.apiBase}/oauth2/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || 'TTLock auth failed');
    }

    return data;
  }

  private async authenticate(): Promise<string> {
    const config = await this.resolveConfig();
    const data = await this.authenticateWithResponse();

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const token = this.tokenRepo.create({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      lockId: config.lockId || undefined,
      gatewayId: config.gatewayId || undefined,
    });
    await this.tokenRepo.save(token);
    return data.access_token;
  }

  private async refreshAccessToken(existing: TtlockToken): Promise<string> {
    const config = await this.resolveConfig();
    const params = new URLSearchParams({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken!,
    });

    const { data } = await axios.post<TtlockAuthResponse>(
      `${config.apiBase}/oauth2/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || 'TTLock refresh failed');
    }

    existing.accessToken = data.access_token;
    if (data.refresh_token) existing.refreshToken = data.refresh_token;
    existing.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.tokenRepo.save(existing);
    return existing.accessToken;
  }

  async unlock(): Promise<{ success: boolean; message: string }> {
    const config = await this.resolveConfig();
    if (this.shouldUseMock(config)) {
      this.logger.log('Mock unlock success');
      return { success: true, message: '模拟开门成功' };
    }

    this.assertLockConfigured(config);

    const accessToken = await this.ensureAccessToken();

    const params = new URLSearchParams({
      clientId: config.clientId,
      accessToken,
      lockId: String(config.lockId),
      date: String(this.nowMs()),
    });

    const { data } = await axios.post<TtlockBaseResponse>(
      `${config.apiBase}/v3/lock/unlock`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 },
    );

    if (!this.ttlockApiFailed(data.errcode)) {
      return { success: true, message: '开门成功' };
    }
    return { success: false, message: data.errmsg || data.description || '开门失败' };
  }

  async createKeyboardPassword(
    startDate: Date,
    endDate: Date,
    keyboardPwdName: string,
  ): Promise<{ keyboardPwd: string; keyboardPwdId: number }> {
    const config = await this.resolveConfig();
    if (this.shouldUseMock(config)) {
      return this.mockKeyboardPassword();
    }

    this.assertLockConfigured(config);

    const accessToken = await this.ensureAccessToken();
    const keyboardPwdVersion = await this.getKeyboardPwdVersion(
      config.clientId,
      accessToken,
      config.lockId,
      config.apiBase,
    );
    const normalizedStartDate = this.floorToHour(startDate);
    const normalizedEndDate = this.ceilToHour(endDate);

    const params = new URLSearchParams({
      clientId: config.clientId,
      accessToken,
      lockId: String(config.lockId),
      keyboardPwdType: '3',
      keyboardPwdName,
      keyboardPwdVersion: String(keyboardPwdVersion),
      startDate: String(normalizedStartDate.getTime()),
      endDate: String(normalizedEndDate.getTime()),
      date: String(this.nowMs()),
    });

    const { data } = await axios.post<
      TtlockBaseResponse & { keyboardPwd?: string; keyboardPwdId?: number }
    >(`${config.apiBase}/v3/keyboardPwd/get`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    if (this.ttlockApiFailed(data.errcode) || !data.keyboardPwd) {
      throw new Error(data.errmsg || '生成密码失败');
    }

    return {
      keyboardPwd: data.keyboardPwd,
      keyboardPwdId: data.keyboardPwdId!,
    };
  }

  private floorToHour(date: Date): Date {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
  }

  private ceilToHour(date: Date): Date {
    const d = new Date(date);
    if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) {
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);
    return d;
  }

  private async getKeyboardPwdVersion(
    clientId: string,
    accessToken: string,
    lockId: number,
    apiBase: string,
  ): Promise<number> {
    const { data } = await axios.get<
      TtlockBaseResponse & { keyboardPwdVersion?: number }
    >(`${apiBase}/v3/lock/getKeyboardPwdVersion`, {
      params: {
        clientId,
        accessToken,
        lockId,
        date: this.nowMs(),
      },
      timeout: 10000,
    });

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || '获取门锁密码版本失败');
    }
    return data.keyboardPwdVersion ?? 4;
  }

  async listGateways(): Promise<TtlockGatewayItem[]> {
    const config = await this.resolveConfig();
    const accessToken = await this.ensureAccessToken();

    const { data } = await axios.get<{
      list?: TtlockGatewayItem[];
      errcode?: number;
      errmsg?: string;
    }>(`${config.apiBase}/v3/gateway/list`, {
      params: {
        clientId: config.clientId,
        accessToken,
        pageNo: 1,
        pageSize: 100,
        date: this.nowMs(),
      },
    });

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || '获取网关列表失败');
    }
    return data.list || [];
  }

  async listLocks(): Promise<TtlockLockItem[]> {
    const config = await this.resolveConfig();
    const accessToken = await this.ensureAccessToken();

    const { data } = await axios.get<{ list?: TtlockLockItem[]; errcode?: number; errmsg?: string }>(
      `${config.apiBase}/v3/lock/list`,
      {
        params: {
          clientId: config.clientId,
          accessToken,
          pageNo: 1,
          pageSize: 100,
          date: this.nowMs(),
        },
      },
    );

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || '获取锁列表失败');
    }
    return data.list || [];
  }

  async listGatewayLocks(gatewayId?: number): Promise<TtlockLockItem[]> {
    const config = await this.resolveConfig();
    const accessToken = await this.ensureAccessToken();
    const targetGatewayId = gatewayId || config.gatewayId;
    if (!targetGatewayId) return [];

    const { data } = await axios.get<{ list?: TtlockLockItem[]; errcode?: number; errmsg?: string }>(
      `${config.apiBase}/v3/gateway/listLock`,
      {
        params: {
          clientId: config.clientId,
          accessToken,
          gatewayId: targetGatewayId,
          date: this.nowMs(),
        },
      },
    );

    if (this.ttlockApiFailed(data.errcode)) {
      throw new Error(data.errmsg || '获取锁列表失败');
    }
    return data.list || [];
  }
}
