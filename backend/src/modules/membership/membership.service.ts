import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Membership, MembershipStatus } from '../../entities/membership.entity';
import { Product } from '../../entities/product.entity';
import {
  calculateMembershipEnd,
  nextMembershipStartAfter,
} from '../../common/membership-duration';

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

  async activateFromOrder(
    userId: string,
    product: Product,
    orderId: string,
  ): Promise<Membership> {
    const now = new Date();
    const existing = await this.getActiveMembership(userId);

    let startAt = now;
    if (existing && existing.endAt > now) {
      startAt = nextMembershipStartAfter(existing.endAt);
    }

    const endAt = calculateMembershipEnd(startAt, product);

    if (existing && existing.endAt > now) {
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
    return this.activateFromOrder(userId, product, `redemption_${redemptionId}`);
  }

  async manualGrant(
    userId: string,
    product: Product,
  ): Promise<Membership> {
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
