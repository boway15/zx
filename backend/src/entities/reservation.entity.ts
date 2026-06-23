import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Membership } from './membership.entity';
import { Seat } from './seat.entity';

@Entity('reservations')
@Unique(['membershipId', 'reserveDate'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id' })
  membershipId!: string;

  @Column({ name: 'seat_id' })
  seatId!: string;

  @Column({ name: 'reserve_date', type: 'date' })
  reserveDate!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Membership)
  @JoinColumn({ name: 'membership_id' })
  membership!: Membership;

  @ManyToOne(() => Seat)
  @JoinColumn({ name: 'seat_id' })
  seat!: Seat;
}
