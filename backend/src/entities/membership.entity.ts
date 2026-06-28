import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';

export enum MembershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

@Entity('memberships')
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  @Column({ name: 'source_order_id', nullable: true })
  sourceOrderId?: string;

  @Column({ type: 'enum', enum: MembershipStatus, default: MembershipStatus.ACTIVE })
  status!: MembershipStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Product, (product) => product.memberships)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
