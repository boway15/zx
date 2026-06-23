import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';
import { Admin } from './admin.entity';

export enum RedemptionCodeStatus {
  UNUSED = 'unused',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum ExternalPlatform {
  MEITUAN = 'meituan',
  DOUYIN = 'douyin',
  OTHER = 'other',
}

@Entity('redemption_codes')
export class RedemptionCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 11 })
  code!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ type: 'enum', enum: RedemptionCodeStatus, default: RedemptionCodeStatus.UNUSED })
  status!: RedemptionCodeStatus;

  /** 兑换码有效期截止（须在此时间前输入兑换） */
  @Column({ name: 'redeem_valid_until', type: 'timestamptz' })
  redeemValidUntil!: Date;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'external_platform', type: 'enum', enum: ExternalPlatform, nullable: true })
  externalPlatform?: ExternalPlatform;

  @Column({ name: 'external_voucher', nullable: true })
  externalVoucher?: string;

  @Column({ name: 'created_by_admin_id', nullable: true })
  createdByAdminId?: string;

  @Column({ name: 'used_by_user_id', nullable: true })
  usedByUserId?: string;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt?: Date;

  @Column({ name: 'membership_id', nullable: true })
  membershipId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'used_by_user_id' })
  usedByUser?: User;

  @ManyToOne(() => Admin, { nullable: true })
  @JoinColumn({ name: 'created_by_admin_id' })
  createdByAdmin?: Admin;
}
