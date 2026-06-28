import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AccessMethod {
  REMOTE = 'remote',
  PASSCODE = 'passcode',
}

export enum AccessResult {
  SUCCESS = 'success',
  FAIL = 'fail',
}

@Entity('access_logs')
export class AccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  /** 访客开门时关联的兑换码 */
  @Column({ name: 'redemption_code', length: 11, nullable: true })
  redemptionCode?: string;

  @Column({ type: 'enum', enum: AccessMethod })
  method!: AccessMethod;

  @Column({ type: 'enum', enum: AccessResult })
  result!: AccessResult;

  @Column({ name: 'err_msg', nullable: true })
  errMsg?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.accessLogs)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
