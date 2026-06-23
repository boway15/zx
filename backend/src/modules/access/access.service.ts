import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MembershipService } from '../membership/membership.service';
import { TtlockService } from '../ttlock/ttlock.service';
import { SettingsService } from '../settings/settings.service';
import { SeatService } from '../seat/seat.service';
import {
  AccessLog,
  AccessMethod,
  AccessResult,
} from '../../entities/access-log.entity';
import {
  DoorPasscode,
  PasscodeStatus,
} from '../../entities/door-passcode.entity';

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  private readonly unlockAttempts = new Map<string, number[]>();

  constructor(
    @InjectRepository(AccessLog)
    private readonly accessLogRepo: Repository<AccessLog>,
    @InjectRepository(DoorPasscode)
    private readonly passcodeRepo: Repository<DoorPasscode>,
    private readonly membershipService: MembershipService,
    private readonly ttlockService: TtlockService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly seatService: SeatService,
  ) {}

  private checkRateLimit(userId: string): void {
    const now = Date.now();
    const windowMs = 60000;
    const maxAttempts = 5;
    const attempts = (this.unlockAttempts.get(userId) || []).filter(
      (t) => now - t < windowMs,
    );
    if (attempts.length >= maxAttempts) {
      throw new ForbiddenException('操作过于频繁，请稍后再试');
    }
    attempts.push(now);
    this.unlockAttempts.set(userId, attempts);
  }

  isWithinBusinessHours(): boolean {
    const start =
      this.settingsService.getSync('business_hours_start') ||
      this.configService.get<string>('app.businessHoursStart') ||
      '08:00';
    const end =
      this.settingsService.getSync('business_hours_end') ||
      this.configService.get<string>('app.businessHoursEnd') ||
      '22:00';

    const now = new Date();
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      this.logger.warn('营业时间不支持跨天，请检查系统设置');
      return false;
    }
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  async getMembershipStatus(membershipId: string) {
    await this.membershipService.expireOutdated();
    const membership = await this.membershipService.findById(membershipId);
    if (!membership || membership.endAt <= new Date()) {
      return {
        hasActiveMembership: false,
        membership: null,
        passcode: null,
        reservation: null,
        businessHours: this.getBusinessHoursInfo(),
      };
    }

    const passcode = await this.getOrCreatePasscode(
      membership.userId,
      membership.id,
      membership.endAt,
    );
    const reservation = await this.seatService.getMyReservation(membership.id);

    return {
      hasActiveMembership: true,
      membership: {
        id: membership.id,
        startAt: membership.startAt,
        endAt: membership.endAt,
        productName: membership.product?.name,
      },
      passcode: passcode.ttlockKeyboardPwd,
      reservation,
      businessHours: this.getBusinessHoursInfo(),
    };
  }

  private getBusinessHoursInfo() {
    return {
      start:
        this.settingsService.getSync('business_hours_start') ||
        this.configService.get<string>('app.businessHoursStart'),
      end:
        this.settingsService.getSync('business_hours_end') ||
        this.configService.get<string>('app.businessHoursEnd'),
      isOpen: this.isWithinBusinessHours(),
    };
  }

  async getPasscodeByMembership(membershipId: string) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership || membership.endAt <= new Date()) {
      throw new ForbiddenException('会员卡已过期');
    }
    return this.getPasscode(membership.userId);
  }

  async getPasscodeForUser(userId: string) {
    return this.getPasscode(userId);
  }

  async unlockDoorByMembership(membershipId: string) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) {
      throw new ForbiddenException('会员卡不存在');
    }

    const reservation = await this.seatService.getMyReservation(membershipId);
    if (!reservation) {
      throw new ForbiddenException('请先预约今日座位');
    }

    const result = await this.unlockDoor(membership.userId);
    return { ...result, reservation };
  }

  async getUserStatus(userId: string) {
    await this.membershipService.expireOutdated();
    const membership = await this.membershipService.getActiveMembership(userId);
    const passcode = membership
      ? await this.getOrCreatePasscode(userId, membership.id, membership.endAt)
      : null;

    return {
      hasActiveMembership: !!membership,
      membership: membership
        ? {
            id: membership.id,
            startAt: membership.startAt,
            endAt: membership.endAt,
            productName: membership.product?.name,
          }
        : null,
      passcode: passcode?.ttlockKeyboardPwd || null,
      businessHours: {
        start:
          this.settingsService.getSync('business_hours_start') ||
          this.configService.get<string>('app.businessHoursStart'),
        end:
          this.settingsService.getSync('business_hours_end') ||
          this.configService.get<string>('app.businessHoursEnd'),
        isOpen: this.isWithinBusinessHours(),
      },
    };
  }

  async unlockDoor(userId: string) {
    this.checkRateLimit(userId);

    if (!this.isWithinBusinessHours()) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.FAIL, '非营业时间');
      throw new ForbiddenException('当前非营业时间');
    }

    const membership = await this.membershipService.getActiveMembership(userId);
    if (!membership) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.FAIL, '无有效会员卡');
      throw new ForbiddenException('您还没有有效的会员卡，请先购卡');
    }

    const result = await this.ttlockService.unlock();

    if (result.success) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.SUCCESS);
      return {
        success: true,
        method: 'remote',
        message: result.message,
      };
    }

    this.logger.warn(`Remote unlock failed for user ${userId}: ${result.message}`);

    const passcode = await this.getOrCreatePasscode(
      userId,
      membership.id,
      membership.endAt,
    );

    await this.logAccess(
      userId,
      AccessMethod.PASSCODE,
      AccessResult.SUCCESS,
      `远程开门失败，已提供备用密码: ${result.message}`,
    );

    return {
      success: true,
      method: 'passcode',
      message: '远程开门失败，请使用备用密码',
      passcode: passcode.ttlockKeyboardPwd,
    };
  }

  async getPasscode(userId: string) {
    const membership = await this.membershipService.getActiveMembership(userId);
    if (!membership) {
      throw new ForbiddenException('您还没有有效的会员卡');
    }

    const passcode = await this.getOrCreatePasscode(
      userId,
      membership.id,
      membership.endAt,
    );

    return {
      passcode: passcode.ttlockKeyboardPwd,
      validFrom: passcode.validFrom,
      validTo: passcode.validTo,
    };
  }

  private async getOrCreatePasscode(
    userId: string,
    membershipId: string,
    validTo: Date,
  ): Promise<DoorPasscode> {
    const existing = await this.passcodeRepo.findOne({
      where: {
        userId,
        membershipId,
        status: PasscodeStatus.ACTIVE,
        validTo: MoreThan(new Date()),
      },
    });

    if (existing) return existing;

    const validFrom = new Date();
    const { keyboardPwd, keyboardPwdId } =
      await this.ttlockService.createKeyboardPassword(
        validFrom,
        validTo,
        `user_${userId.slice(0, 8)}`,
      );

    const passcode = this.passcodeRepo.create({
      userId,
      membershipId,
      ttlockKeyboardPwd: keyboardPwd,
      ttlockKeyboardPwdId: keyboardPwdId,
      validFrom,
      validTo,
      status: PasscodeStatus.ACTIVE,
    });

    return this.passcodeRepo.save(passcode);
  }

  private async logAccess(
    userId: string,
    method: AccessMethod,
    result: AccessResult,
    errMsg?: string,
  ) {
    const log = this.accessLogRepo.create({
      userId,
      method,
      result,
      errMsg,
    });
    await this.accessLogRepo.save(log);
  }

  async listLogs(page = 1, limit = 20) {
    const [items, total] = await this.accessLogRepo.findAndCount({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async countTodayUnlocks(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.accessLogRepo
      .createQueryBuilder('log')
      .where('log.created_at >= :start', { start: startOfDay })
      .andWhere('log.result = :result', { result: AccessResult.SUCCESS })
      .getCount();
  }
}
