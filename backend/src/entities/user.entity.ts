import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Order } from './order.entity';
import { Membership } from './membership.entity';
import { AccessLog } from './access-log.entity';
import { DoorPasscode } from './door-passcode.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  openid!: string;

  @Column({ nullable: true })
  nickname?: string;

  @Column({ nullable: true })
  phone?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => Order, (order) => order.user)
  orders!: Order[];

  @OneToMany(() => Membership, (membership) => membership.user)
  memberships!: Membership[];

  @OneToMany(() => AccessLog, (log) => log.user)
  accessLogs!: AccessLog[];

  @OneToMany(() => DoorPasscode, (passcode) => passcode.user)
  passcodes!: DoorPasscode[];
}
