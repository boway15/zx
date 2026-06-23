import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from '../../entities/room.entity';
import { Seat } from '../../entities/seat.entity';
import { Reservation } from '../../entities/reservation.entity';
import { RedemptionCode } from '../../entities/redemption-code.entity';
import { RoomService } from './room.service';
import { SeatService } from './seat.service';
import { SeatController } from './seat.controller';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, Seat, Reservation, RedemptionCode]),
    MembershipModule,
  ],
  providers: [RoomService, SeatService],
  controllers: [SeatController],
  exports: [SeatService, RoomService],
})
export class SeatModule {}
