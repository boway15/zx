import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Membership } from './membership.entity';

export enum PasscodeStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('door_passcodes')
export class DoorPasscode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'membership_id' })
  membershipId!: string;

  @Column({ name: 'ttlock_keyboard_pwd' })
  ttlockKeyboardPwd!: string;

  @Column({ name: 'ttlock_keyboard_pwd_id', type: 'bigint', nullable: true })
  ttlockKeyboardPwdId?: number;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: 'timestamptz' })
  validTo!: Date;

  @Column({ type: 'enum', enum: PasscodeStatus, default: PasscodeStatus.ACTIVE })
  status!: PasscodeStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.passcodes)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Membership)
  @JoinColumn({ name: 'membership_id' })
  membership!: Membership;
}
