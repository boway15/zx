import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import {
  RedemptionCode,
  RedemptionCodeStatus,
} from '../../entities/redemption-code.entity';
import { Product } from '../../entities/product.entity';
import { ProductService } from '../product/product.service';
import { MembershipService } from '../membership/membership.service';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { SeatService } from '../seat/seat.service';
import { CreateRedemptionCodeDto } from './redemption.dto';
import { MembershipStatus } from '../../entities/membership.entity';
import {
  calculateNaturalDayExpiry,
  getNaturalDays,
} from '../../common/membership-duration';
import {
  getBookingHorizonDays,
  getSelectableStartDates,
} from '../../common/booking-schedule';

@Injectable()
export class RedemptionService {
  private static readonly CODE_LENGTH = 11;

  constructor(
    @InjectRepository(RedemptionCode)
    private readonly codeRepo: Repository<RedemptionCode>,
    private readonly productService: ProductService,
    private readonly membershipService: MembershipService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly seatService: SeatService,
    @Inject(forwardRef(() => AccessService))
    private readonly accessService: AccessService,
  ) {}

  /** 规范为11位纯数字 */
  normalizeCode(codeInput: string): string {
    const code = codeInput.replace(/\D/g, '');
    if (!/^\d{11}$/.test(code)) {
      throw new BadRequestException('兑换码必须为11位纯数字');
    }
    return code;
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < RedemptionService.CODE_LENGTH; i++) {
      code += crypto.randomInt(0, 10).toString();
    }
    return code;
  }

  private async resolveCode(manual?: string): Promise<string> {
    if (manual?.trim()) {
      const code = this.normalizeCode(manual.trim());
      const exists = await this.codeRepo.findOne({ where: { code } });
      if (exists) {
        throw new BadRequestException('该兑换码已存在，请换一个');
      }
      return code;
    }
    return this.uniqueCode();
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateCode();
      const exists = await this.codeRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('生成兑换码失败，请重试');
  }

  async create(adminId: string, dto: CreateRedemptionCodeDto) {
    const product = await this.productService.findById(dto.productId);
    const days = dto.redeemValidDays ?? 7;
    const redeemValidUntil = calculateNaturalDayExpiry(new Date(), days);

    const redemption = this.codeRepo.create({
      code: await this.resolveCode(dto.code),
      productId: product.id,
      status: RedemptionCodeStatus.UNUSED,
      redeemValidUntil,
      note: dto.note,
      externalPlatform: dto.externalPlatform,
      externalVoucher: dto.externalVoucher,
      createdByAdminId: adminId,
    });

    const saved = await this.codeRepo.save(redemption);
    return this.codeRepo.findOne({
      where: { id: saved.id },
      relations: ['product'],
    });
  }

  /** 预览兑换码（兑换前展示信息，不执行兑换） */
  async previewCode(codeInput: string) {
    const code = this.normalizeCode(codeInput);
    const record = await this.codeRepo.findOne({
      where: { code },
      relations: ['product'],
    });

    if (!record) {
      throw new NotFoundException('兑换码不存在');
    }

    if (record.status === RedemptionCodeStatus.REVOKED) {
      throw new BadRequestException('该兑换码已作废');
    }

    if (record.status === RedemptionCodeStatus.UNUSED) {
      if (record.redeemValidUntil < new Date()) {
        record.status = RedemptionCodeStatus.EXPIRED;
        await this.codeRepo.save(record);
        throw new BadRequestException('该兑换码已过期，请联系管理员重新生成');
      }

      const naturalDays = getNaturalDays(record.product);
      const selectableStarts = getSelectableStartDates(
        record.product,
        record.redeemValidUntil,
      );

      return {
        isFirstRedeem: true,
        code: record.code,
        productName: record.product.name,
        productDescription: record.product.description,
        productType: record.product.type,
        naturalDays,
        bookingHorizonDays: getBookingHorizonDays(record.product),
        redeemValidUntil: record.redeemValidUntil,
        selectableStartDates: selectableStarts,
      };
    }

    if (record.status === RedemptionCodeStatus.USED) {
      if (!record.membershipId) {
        throw new BadRequestException('兑换码状态异常，请联系管理员');
      }
      const membership = await this.membershipService.findById(record.membershipId);
      if (!membership) {
        throw new BadRequestException('会员卡不存在');
      }
      if (membership.status === MembershipStatus.PENDING) {
        if (record.redeemValidUntil < new Date()) {
          throw new BadRequestException('兑换码已过期，请重新预约或联系管理员');
        }
        return {
          isFirstRedeem: false,
          isPending: true,
          code: record.code,
          productName: record.product.name,
          productType: record.product.type,
          naturalDays: getNaturalDays(record.product),
          redeemValidUntil: record.redeemValidUntil,
        };
      }

      if (!membership.endAt || membership.endAt <= new Date()) {
        throw new BadRequestException('会员卡已过期');
      }

      return {
        isFirstRedeem: false,
        isPending: false,
        code: record.code,
        productName: record.product.name,
        membershipStartAt: membership.startAt,
        membershipEndAt: membership.endAt,
      };
    }

    throw new BadRequestException('该兑换码已过期');
  }

  /** 免登录：输入兑换码进入（兑换绑定或已兑换且在有效期内） */
  async accessByCode(codeInput: string) {
    const code = this.normalizeCode(codeInput);
    const record = await this.codeRepo.findOne({
      where: { code },
      relations: ['product'],
    });

    if (!record) {
      throw new NotFoundException('兑换码不存在');
    }

    if (record.status === RedemptionCodeStatus.REVOKED) {
      throw new BadRequestException('该兑换码已作废');
    }

    let membership;

    if (record.status === RedemptionCodeStatus.UNUSED) {
      if (record.redeemValidUntil < new Date()) {
        record.status = RedemptionCodeStatus.EXPIRED;
        await this.codeRepo.save(record);
        throw new BadRequestException('该兑换码已过期，请联系管理员重新生成');
      }
      membership = await this.performRedeem(record);
    } else if (record.status === RedemptionCodeStatus.USED) {
      if (!record.membershipId) {
        throw new BadRequestException('兑换码状态异常，请联系管理员');
      }
      membership = await this.membershipService.findById(record.membershipId);
      if (!membership) {
        throw new BadRequestException('会员卡不存在');
      }
      if (membership.status === MembershipStatus.PENDING) {
        if (record.redeemValidUntil < new Date()) {
          throw new BadRequestException('兑换码已过期，请重新预约或联系管理员');
        }
      } else if (!membership.endAt || membership.endAt <= new Date()) {
        throw new BadRequestException('会员卡已过期');
      }
    } else {
      throw new BadRequestException('该兑换码已过期');
    }

    const isPending = membership.status === MembershipStatus.PENDING;
    const tokenExpiresAt = isPending
      ? record.redeemValidUntil
      : membership.endAt!;

    const userId = membership.userId;
    const passcode = isPending
      ? null
      : await this.accessService.getPasscodeForUser(userId);
    const reservation = await this.seatService.getMyReservation(membership.id);
    const token = this.authService.signMembershipToken(
      membership.id,
      tokenExpiresAt,
    );

    return {
      ...token,
      code: record.code,
      membership: {
        id: membership.id,
        productName: record.product.name,
        productType: record.product.type,
        status: membership.status,
        pending: isPending,
        startAt: membership.startAt,
        endAt: membership.endAt,
        naturalDays: getNaturalDays(record.product),
        bookingHorizonDays: getBookingHorizonDays(record.product),
        redeemValidUntil: record.redeemValidUntil,
      },
      passcode: passcode?.passcode ?? null,
      passcodeValidTo: passcode?.validTo ?? null,
      reservation,
    };
  }

  private async performRedeem(record: RedemptionCode) {
    return this.codeRepo.manager.transaction(async (em) => {
      const locked = await em.findOne(RedemptionCode, {
        where: { id: record.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!locked) {
        throw new NotFoundException('兑换码不存在');
      }

      const product = await em.findOne(Product, { where: { id: locked.productId } });
      if (!product) {
        throw new BadRequestException('兑换码关联的商品不存在');
      }

      if (locked.status === RedemptionCodeStatus.USED) {
        if (!locked.membershipId) {
          throw new BadRequestException('兑换码状态异常，请联系管理员');
        }
        const existing = await this.membershipService.findById(locked.membershipId);
        if (!existing) {
          throw new BadRequestException('会员卡不存在');
        }
        return existing;
      }

      if (locked.status !== RedemptionCodeStatus.UNUSED) {
        throw new BadRequestException('该兑换码不可用');
      }

      if (locked.redeemValidUntil < new Date()) {
        locked.status = RedemptionCodeStatus.EXPIRED;
        await em.save(locked);
        throw new BadRequestException('该兑换码已过期，请联系管理员重新生成');
      }

      const guestOpenid = `guest_${locked.code}`;
      const user = await this.userService.createOrUpdate(guestOpenid, '访客');

      const membership = await this.membershipService.createPendingFromRedemption(
        user.id,
        product,
        locked.id,
        em,
      );

      locked.status = RedemptionCodeStatus.USED;
      locked.usedByUserId = user.id;
      locked.usedAt = new Date();
      locked.membershipId = membership.id;
      await em.save(locked);

      return membership;
    });
  }

  async extendRedeemValidDays(id: string, days: number) {
    if (days < 1) {
      throw new BadRequestException('延长天数至少为 1');
    }

    const record = await this.codeRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('兑换码不存在');
    if (record.status === RedemptionCodeStatus.REVOKED) {
      throw new BadRequestException('已作废的兑换码不能延长');
    }

    record.redeemValidUntil = calculateNaturalDayExpiry(new Date(), days);
    if (record.status === RedemptionCodeStatus.EXPIRED) {
      record.status = record.membershipId
        ? RedemptionCodeStatus.USED
        : RedemptionCodeStatus.UNUSED;
    }

    return this.codeRepo.save(record);
  }

  async list(page = 1, limit = 20, status?: RedemptionCodeStatus) {
    const where = status ? { status } : {};
    const [items, total] = await this.codeRepo.findAndCount({
      where,
      relations: ['product', 'usedByUser'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async revoke(id: string) {
    const record = await this.codeRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('兑换码不存在');
    if (record.status !== RedemptionCodeStatus.UNUSED) {
      throw new BadRequestException('只能作废未使用的兑换码');
    }
    record.status = RedemptionCodeStatus.REVOKED;
    return this.codeRepo.save(record);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireOutdatedCodes() {
    const now = new Date();
    await this.codeRepo.update(
      {
        status: RedemptionCodeStatus.UNUSED,
        redeemValidUntil: LessThan(now),
      },
      { status: RedemptionCodeStatus.EXPIRED },
    );
  }
}
