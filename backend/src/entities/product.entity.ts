import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Order } from './order.entity';
import { Membership } from './membership.entity';

export enum ProductType {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: ProductType })
  type!: ProductType;

  @Column({ name: 'duration_hours', type: 'int' })
  durationHours!: number;

  @Column({ name: 'price_fen', type: 'int' })
  priceFen!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Order, (order) => order.product)
  orders!: Order[];

  @OneToMany(() => Membership, (membership) => membership.product)
  memberships!: Membership[];
}
