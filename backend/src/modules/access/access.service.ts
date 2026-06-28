import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MembershipService } from '../membership/membership.service';
import { TtlockService } from '../ttlock/ttlock.service';
import { SettingsService } from '../settings/settings.service';
import { SeatService } from '../seat/seat.service';
import { MembershipStatus } from '../../entities/membership.entity';
import {
  AccessLog,
  AccessMethod,
  AccessResult,
} from '../../entities/access-log.entity';
import {
  DoorPasscode,
  PasscodeStatus,
} from '../../entities/door-passcode.entity';
import { RedemptionCode } from '../../entities/redemption-code.entity';

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  private readonly unlockAttempts = new Map<string, number[]>();

  constructor(
    @InjectRepository(AccessLog)
    private readonly accessLogRepo: Repository<AccessLog>,
    @InjectRepository(DoorPasscode)
    private readonly passcodeRepo: Repository<DoorPasscode>,
    @InjectRepository(RedemptionCode)
    private readonly redemptionCodeRepo: Repository<RedemptionCode>,
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
    if (!membership) {
      return {
        hasActiveMembership: false,
        membership: null,
        passcode: null,
        reservation: null,
        businessHours: this.getBusinessHoursInfo(),
      };
    }

    const isPending = membership.status === MembershipStatus.PENDING;
    const isInPeriod = this.membershipService.isActiveInPeriod(membership);
    const hasBookedMembership =
      isPending ||
      (membership.status === MembershipStatus.ACTIVE &&
        !!membership.endAt &&
        membership.endAt > new Date());

    if (!hasBookedMembership) {
      return {
        hasActiveMembership: false,
        membership: null,
        passcode: null,
        reservation: null,
        businessHours: this.getBusinessHoursInfo(),
      };
    }

    const passcode =
      isInPeriod && membership.endAt
        ? await this.getOrCreatePasscode(
            membership.userId,
            membership.id,
            membership.endAt,
          )
        : null;
    const reservation = await this.seatService.getMyReservation(membership.id);

    return {
      hasActiveMembership: isInPeriod,
      pending: isPending,
      membership: {
        id: membership.id,
        status: membership.status,
        pending: isPending,
        startAt: membership.startAt,
        endAt: membership.endAt,
        productName: membership.product?.name,
      },
      passcode: passcode?.ttlockKeyboardPwd ?? null,
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
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !membership.endAt ||
      membership.endAt <= new Date()
    ) {
      throw new ForbiddenException('会员卡尚未激活或已过期');
    }
    return this.getPasscode(membership.userId);
  }

  async getPasscodeForUser(userId: string) {
    return this.getPasscode(userId);
  }

  /** 管理员强制远程开锁，跳过营业时间、会员卡、预约及频率限制 */
  async unlockByAdmin() {
    const result = await this.ttlockService.unlock();
    if (!result.success) {
      throw new ForbiddenException(result.message || '开门失败');
    }
    return result;
  }

  /** 获取或生成管理员当日临时密码（仅当天有效，次日自动失效并重新生成） */
  async getAdminDailyPasscode() {
    const { start, end, dateKey } = this.getTodayBounds();

    const cachedDate = await this.settingsService.get('admin_daily_passcode_date');
    const cachedPasscode = await this.settingsService.get('admin_daily_passcode');

    if (cachedDate === dateKey && cachedPasscode) {
      return {
        passcode: cachedPasscode,
        validFrom: start,
        validTo: end,
        validDate: dateKey,
      };
    }

    const { keyboardPwd, keyboardPwdId } =
      await this.ttlockService.createKeyboardPassword(
        start,
        end,
        `admin_daily_${dateKey}`,
      );

    await this.settingsService.setMany({
      admin_daily_passcode: keyboardPwd,
      admin_daily_passcode_date: dateKey,
      admin_daily_passcode_id: String(keyboardPwdId),
    });

    return {
      passcode: keyboardPwd,
      validFrom: start,
      validTo: end,
      validDate: dateKey,
    };
  }

  private getTodayBounds(): { start: Date; end: Date; dateKey: string } {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const dateKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return { start, end, dateKey };
  }

  async unlockDoorByMembership(membershipId: string) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) {
      throw new ForbiddenException('会员卡不存在');
    }

    if (membership.status === MembershipStatus.PENDING) {
      throw new ForbiddenException('请先完成预约以激活会员卡');
    }

    if (!this.membershipService.isActiveInPeriod(membership)) {
      throw new ForbiddenException('当前不在会员卡有效期内，无法开门');
    }

    const reservation = await this.seatService.getMyReservation(membershipId);
    if (!reservation) {
      throw new ForbiddenException('请先预约座位');
    }
    if (!reservation.hasTodayReservation) {
      throw new ForbiddenException('今日无预约座位，请在预约使用日内再试');
    }

    const redemptionCode = await this.resolveRedemptionCode(membershipId);
    const result = await this.unlockDoor(membership.userId, redemptionCode);
    return { ...result, reservation };
  }

  async getUserStatus(userId: string) {
    await this.membershipService.expireOutdated();
    const membership = await this.membershipService.getActiveMembership(userId);
    const passcode = membership?.endAt
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

  async unlockDoor(userId: string, redemptionCode?: string) {
    this.checkRateLimit(userId);

    if (!this.isWithinBusinessHours()) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.FAIL, '非营业时间', redemptionCode);
      throw new ForbiddenException('当前非营业时间');
    }

    const membership = await this.membershipService.getActiveMembership(userId);
    if (!membership) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.FAIL, '无有效会员卡', redemptionCode);
      throw new ForbiddenException('您还没有有效的会员卡，请先购卡');
    }

    const result = await this.ttlockService.unlock();

    if (result.success) {
      await this.logAccess(userId, AccessMethod.REMOTE, AccessResult.SUCCESS, undefined, redemptionCode);
      return {
        success: true,
        method: 'remote',
        message: result.message,
      };
    }

    this.logger.warn(`Remote unlock failed for user ${userId}: ${result.message}`);

    if (!membership.endAt) {
      throw new ForbiddenException('会员卡尚未激活');
    }

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
      redemptionCode,
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

    if (!membership.endAt) {
      throw new ForbiddenException('会员卡尚未激活');
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

  private async resolveRedemptionCode(membershipId: string): Promise<string | undefined> {
    const record = await this.redemptionCodeRepo.findOne({ where: { membershipId } });
    return record?.code;
  }

  private async logAccess(
    userId: string,
    method: AccessMethod,
    result: AccessResult,
    errMsg?: string,
    redemptionCode?: string,
  ) {
    const log = this.accessLogRepo.create({
      userId,
      method,
      result,
      errMsg,
      redemptionCode,
    });
    await this.accessLogRepo.save(log);
  }

  async listLogs(page = 1, limit = 20, code?: string) {
    const qb = this.accessLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const normalized = code?.replace(/\D/g, '');
    if (normalized) {
      qb.andWhere('log.redemptionCode LIKE :code', { code: `%${normalized}%` });
    }

    const [items, total] = await qb.getManyAndCount();
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
