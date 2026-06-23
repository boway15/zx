import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from '../../entities/room.entity';
import { Seat } from '../../entities/seat.entity';

const ROOM_CONFIG = [
  { code: '301', seatCount: 7, sortOrder: 1 },
  { code: '302', seatCount: 11, sortOrder: 2 },
  { code: '303', seatCount: 7, sortOrder: 3 },
  { code: '304', seatCount: 6, sortOrder: 4 },
  { code: '305', seatCount: 7, sortOrder: 5 },
];

@Injectable()
export class RoomService implements OnModuleInit {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Seat)
    private readonly seatRepo: Repository<Seat>,
  ) {}

  async onModuleInit() {
    await this.seedRoomsAndSeats();
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

      const existingCount = await this.seatRepo.count({ where: { roomId: room.id } });
      if (existingCount >= cfg.seatCount) continue;

      for (let n = existingCount + 1; n <= cfg.seatCount; n++) {
        const exists = await this.seatRepo.findOne({
          where: { roomId: room.id, seatNo: n },
        });
        if (!exists) {
          await this.seatRepo.save(
            this.seatRepo.create({ roomId: room.id, seatNo: n, bookable: true }),
          );
        }
      }
    }
  }

  async listRoomsWithSeats() {
    return this.roomRepo.find({
      relations: ['seats'],
      order: { sortOrder: 'ASC' },
    });
  }
}
