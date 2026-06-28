import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, MoreThan } from 'typeorm';
import { Membership, MembershipStatus } from '../../entities/membership.entity';
import { Product } from '../../entities/product.entity';
import {
  calculateMembershipEnd,
  nextMembershipStartAfter,
  startOfNaturalDay,
} from '../../common/membership-duration';
import { parseDateStr } from '../../common/booking-schedule';

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
  ) {}

  async findById(id: string): Promise<Membership | null> {
    return this.membershipRepo.findOne({
      where: { id },
      relations: ['product'],
    });
  }

  isPending(membership: Membership): boolean {
    return membership.status === MembershipStatus.PENDING;
  }

  isActiveInPeriod(membership: Membership, at = new Date()): boolean {
    if (membership.status !== MembershipStatus.ACTIVE) return false;
    if (!membership.startAt || !membership.endAt) return false;
    return membership.startAt <= at && membership.endAt > at;
  }

  async assertMembershipSessionValid(membershipId: string): Promise<Membership> {
    const membership = await this.findById(membershipId);
    if (!membership) {
      throw new BadRequestException('会员卡不存在');
    }

    if (membership.status === MembershipStatus.EXPIRED) {
      throw new BadRequestException('会员卡已过期');
    }

    if (
      membership.status === MembershipStatus.ACTIVE &&
      membership.endAt &&
      membership.endAt <= new Date()
    ) {
      throw new BadRequestException('会员卡已过期');
    }

    return membership;
  }

  async getActiveMembership(userId: string): Promise<Membership | null> {
    const now = new Date();
    const membership = await this.membershipRepo.findOne({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        endAt: MoreThan(now),
      },
      relations: ['product'],
      order: { endAt: 'DESC' },
    });
    return membership;
  }

  async createPendingFromRedemption(
    userId: string,
    product: Product,
    redemptionId: string,
    em?: EntityManager,
  ): Promise<Membership> {
    const repo = em ? em.getRepository(Membership) : this.membershipRepo;
    const membership = repo.create({
      userId,
      productId: product.id,
      startAt: null,
      endAt: null,
      sourceOrderId: `redemption_${redemptionId}`,
      status: MembershipStatus.PENDING,
    });
    return repo.save(membership);
  }

  async activateFromReservation(
    membershipId: string,
    startDateStr: string,
    em?: EntityManager,
  ): Promise<Membership> {
    const repo = em ? em.getRepository(Membership) : this.membershipRepo;
    const membership = await repo.findOne({
      where: { id: membershipId },
      relations: ['product'],
    });

    if (!membership?.product) {
      throw new BadRequestException('会员卡不存在');
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException('会员卡已激活');
    }

    const startAt = parseDateStr(startDateStr);
    const endAt = calculateMembershipEnd(startAt, membership.product);
    membership.startAt = startAt;
    membership.endAt = endAt;
    membership.status = MembershipStatus.ACTIVE;
    return repo.save(membership);
  }

  async activateFromOrder(
    userId: string,
    product: Product,
    orderId: string,
  ): Promise<Membership> {
    const now = new Date();
    const existing = await this.getActiveMembership(userId);

    let startAt = startOfNaturalDay(now);
    if (existing && existing.endAt && existing.endAt > now) {
      startAt = nextMembershipStartAfter(existing.endAt);
    }

    const endAt = calculateMembershipEnd(startAt, product);

    if (existing && existing.endAt && existing.endAt > now) {
      existing.endAt = endAt;
      existing.productId = product.id;
      existing.sourceOrderId = orderId;
      return this.membershipRepo.save(existing);
    }

    const membership = this.membershipRepo.create({
      userId,
      productId: product.id,
      startAt,
      endAt,
      sourceOrderId: orderId,
      status: MembershipStatus.ACTIVE,
    });
    return this.membershipRepo.save(membership);
  }

  async activateFromRedemption(
    userId: string,
    product: Product,
    redemptionId: string,
  ): Promise<Membership> {
    return this.createPendingFromRedemption(userId, product, redemptionId);
  }

  async manualGrant(userId: string, product: Product): Promise<Membership> {
    return this.activateFromOrder(userId, product, 'manual');
  }

  async listByUser(userId: string): Promise<Membership[]> {
    return this.membershipRepo.find({
      where: { userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
  }

  async listActive(): Promise<Membership[]> {
    const now = new Date();
    return this.membershipRepo.find({
      where: { status: MembershipStatus.ACTIVE, endAt: MoreThan(now) },
      relations: ['user', 'product'],
      order: { endAt: 'ASC' },
    });
  }

  async countActive(): Promise<number> {
    const now = new Date();
    return this.membershipRepo.count({
      where: { status: MembershipStatus.ACTIVE, endAt: MoreThan(now) },
    });
  }

  async expireOutdated() {
    const now = new Date();
    await this.membershipRepo
      .createQueryBuilder()
      .update(Membership)
      .set({ status: MembershipStatus.EXPIRED })
      .where('end_at <= :now AND status = :status', {
        now,
        status: MembershipStatus.ACTIVE,
      })
      .execute();
  }
}
