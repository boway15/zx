import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../../entities/room.entity';
import { Seat } from '../../entities/seat.entity';

const ROOM_CONFIG = [
  { code: '301', startSeatNo: 1, endSeatNo: 7, sortOrder: 1 },
  { code: '302', startSeatNo: 8, endSeatNo: 19, sortOrder: 2 },
  { code: '303', startSeatNo: 20, endSeatNo: 26, sortOrder: 3 },
  { code: '304', startSeatNo: 27, endSeatNo: 31, sortOrder: 4 },
  { code: '305', startSeatNo: 32, endSeatNo: 38, sortOrder: 5 },
];

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Seat)
    private readonly seatRepo: Repository<Seat>,
  ) {}

  async onModuleInit() {
    await this.seedRoomsAndSeats();
  }

  private targetSeatNumbers(startSeatNo: number, endSeatNo: number): number[] {
    const numbers: number[] = [];
    for (let n = startSeatNo; n <= endSeatNo; n++) {
      numbers.push(n);
    }
    return numbers;
  }

  private async seedRoomsAndSeats() {
    for (const cfg of ROOM_CONFIG) {
      let room = await this.roomRepo.findOne({ where: { code: cfg.code } });
      if (!room) {
        room = await this.roomRepo.save(
          this.roomRepo.create({
            code: cfg.code,
            name: `${cfg.code}教室`,
            sortOrder: cfg.sortOrder,
          }),
        );
      }

      await this.syncRoomSeats(room.id, cfg.startSeatNo, cfg.endSeatNo);
    }
  }

  /** 按全局编号同步教室座位（启动时幂等执行） */
  private async syncRoomSeats(
    roomId: string,
    startSeatNo: number,
    endSeatNo: number,
  ) {
    const targetNos = this.targetSeatNumbers(startSeatNo, endSeatNo);
    let seats = await this.seatRepo.find({
      where: { roomId },
      order: { seatNo: 'ASC' },
    });

    for (let i = 0; i < seats.length; i++) {
      await this.seatRepo.update(seats[i].id, { seatNo: -(10000 + i) });
    }

    seats = await this.seatRepo.find({
      where: { roomId },
      order: { seatNo: 'ASC' },
    });

    while (seats.length > targetNos.length) {
      const extra = seats.pop()!;
      try {
        await this.seatRepo.delete(extra.id);
      } catch {
        this.logger.warn(
          `座位 ${extra.id} 仍有预约记录，无法删除，已设为不可预约`,
        );
        await this.seatRepo.update(extra.id, {
          seatNo: 90000 + seats.length,
          bookable: false,
        });
      }
    }

    for (let i = 0; i < seats.length; i++) {
      await this.seatRepo.update(seats[i].id, { seatNo: targetNos[i] });
    }

    for (let i = seats.length; i < targetNos.length; i++) {
      await this.seatRepo.save(
        this.seatRepo.create({
          roomId,
          seatNo: targetNos[i],
          bookable: true,
        }),
      );
    }
  }

  async listRoomsWithSeats() {
    return this.roomRepo.find({
      relations: ['seats'],
      order: { sortOrder: 'ASC' },
    });
  }
}
