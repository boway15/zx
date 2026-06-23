import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Room } from './room.entity';

@Entity('seats')
@Unique(['roomId', 'seatNo'])
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id' })
  roomId!: string;

  @Column({ name: 'seat_no', type: 'int' })
  seatNo!: number;

  /** 管理员是否开放预约 */
  @Column({ default: true })
  bookable!: boolean;

  @ManyToOne(() => Room, (room) => room.seats)
  @JoinColumn({ name: 'room_id' })
  room!: Room;
}
