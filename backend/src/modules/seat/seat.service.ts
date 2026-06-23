import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Seat } from '../../entities/seat.entity';
import { Reservation } from '../../entities/reservation.entity';
import { RedemptionCode } from '../../entities/redemption-code.entity';
import { Membership } from '../../entities/membership.entity';
import { Product, ProductType } from '../../entities/product.entity';
import { MembershipService } from '../membership/membership.service';
import { RoomService } from './room.service';
import { CreateReservationDto } from './seat.dto';

@Injectable()
export class SeatService {
  constructor(
    @InjectRepository(Seat)
    private readonly seatRepo: Repository<Seat>,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(RedemptionCode)
    private readonly codeRepo: Repository<RedemptionCode>,
    private readonly membershipService: MembershipService,
    private readonly roomService: RoomService,
  ) {}

  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private todayDateStr(): string {
    return this.localDateStr(new Date());
  }

  private isMultiDayProduct(product: Product): boolean {
    return product.type === ProductType.WEEK || product.type === ProductType.MONTH;
  }

  private enumerateDateStrings(startAt: Date, endAt: Date): string[] {
    const dates: string[] = [];
    const cur = new Date(startAt);
    cur.setHours(12, 0, 0, 0);
    const end = new Date(endAt);
    end.setHours(12, 0, 0, 0);
    while (cur <= end) {
      dates.push(this.localDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  /** 周卡/月卡：从今日（或生效日）至会员卡到期日，需一次性预约的日期列表 */
  private getMultiDayBookingDates(membership: Membership): string[] {
    const startDay = this.localDateStr(membership.startAt);
    const endDay = this.localDateStr(membership.endAt);
    const today = this.todayDateStr();
    const from = today > startDay ? today : startDay;
    if (from > endDay) return [];
    return this.enumerateDateStrings(
      new Date(`${from}T12:00:00`),
      membership.endAt,
    ).filter((d) => d <= endDay);
  }

  private getBookingDates(membership: Membership, singleDate?: string): string[] {
    if (membership.product && this.isMultiDayProduct(membership.product)) {
      return this.getMultiDayBookingDates(membership);
    }
    return [singleDate || this.todayDateStr()];
  }

  private assertDateInMembership(dateStr: string, startAt: Date, endAt: Date) {
    const day = new Date(`${dateStr}T12:00:00`);
    if (day < new Date(startAt.toISOString().slice(0, 10) + 'T00:00:00')) {
      throw new BadRequestException('预约日期早于会员卡生效日');
    }
    if (day > new Date(endAt.toISOString().slice(0, 10) + 'T23:59:59')) {
      throw new BadRequestException('预约日期晚于会员卡有效期');
    }
  }

  private buildBookingMeta(membership: Membership) {
    const multiDay = !!(membership.product && this.isMultiDayProduct(membership.product));
    const dates = multiDay ? this.getMultiDayBookingDates(membership) : [this.todayDateStr()];
    return {
      multiDay,
      productType: membership.product?.type || ProductType.DAY,
      productName: membership.product?.name || '',
      dateFrom: dates[0] || null,
      dateTo: dates[dates.length - 1] || null,
      dayCount: dates.length,
    };
  }

  private formatReservationResult(
    id: string,
    seatLabel: string,
    roomCode: string,
    seatNo: number,
    reserveDate: string,
    booking: ReturnType<SeatService['buildBookingMeta']>,
  ) {
    return {
      id,
      reserveDate,
      seatLabel,
      roomCode,
      seatNo,
      multiDay: booking.multiDay,
      dateFrom: booking.dateFrom,
      dateTo: booking.dateTo,
      dayCount: booking.dayCount,
    };
  }

  async getAvailability(dateStr?: string, membershipId?: string) {
    const date = dateStr || this.todayDateStr();
    let membership: Membership | null = null;
    let rangeDates = [date];

    if (membershipId) {
      membership = await this.membershipService.findById(membershipId);
      if (membership?.product && this.isMultiDayProduct(membership.product)) {
        rangeDates = this.getMultiDayBookingDates(membership);
        if (!rangeDates.length) {
          rangeDates = [date];
        }
      }
    }

    const rooms = await this.roomService.listRoomsWithSeats();
    const reservations = rangeDates.length
      ? await this.reservationRepo.find({
          where: { reserveDate: In(rangeDates) },
        })
      : [];

    const seatDateOwner = new Map<string, Map<string, string>>();
    for (const r of reservations) {
      if (!seatDateOwner.has(r.seatId)) {
        seatDateOwner.set(r.seatId, new Map());
      }
      seatDateOwner.get(r.seatId)!.set(r.reserveDate, r.membershipId);
    }

    const roomList = rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      seats: room.seats
        .sort((a, b) => a.seatNo - b.seatNo)
        .map((seat) => {
          const owners = seatDateOwner.get(seat.id);
          const reservedByOther = rangeDates.some((d) => {
            const owner = owners?.get(d);
            return !!owner && owner !== membershipId;
          });
          const isMine =
            !!membershipId &&
            rangeDates.length > 0 &&
            rangeDates.every((d) => owners?.get(d) === membershipId);
          const reserved = rangeDates.some((d) => !!owners?.get(d));
          return {
            id: seat.id,
            seatNo: seat.seatNo,
            label: `${room.code}-${seat.seatNo}`,
            bookable: seat.bookable,
            reserved,
            isMine,
            reservedByOther,
            available: seat.bookable && !reservedByOther,
          };
        }),
    }));

    return {
      booking: membership
        ? this.buildBookingMeta(membership)
        : {
            multiDay: false,
            productType: ProductType.DAY,
            productName: '',
            dateFrom: date,
            dateTo: date,
            dayCount: 1,
          },
      rooms: roomList,
    };
  }

  async getMyReservation(membershipId: string, dateStr?: string) {
    const date = dateStr || this.todayDateStr();
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) return null;

    const booking = this.buildBookingMeta(membership);

    if (booking.multiDay && booking.dayCount > 0) {
      const rangeDates = this.getMultiDayBookingDates(membership);
      if (!rangeDates.length) return null;

      const rangeReservations = await this.reservationRepo.find({
        where: { membershipId, reserveDate: In(rangeDates) },
        relations: ['seat', 'seat.room'],
      });
      if (!rangeReservations.length) return null;

      const ref =
        rangeReservations.find((r) => r.reserveDate === date) || rangeReservations[0];
      const seat = ref.seat;
      return this.formatReservationResult(
        ref.id,
        `${seat.room.code}-${seat.seatNo}`,
        seat.room.code,
        seat.seatNo,
        ref.reserveDate,
        booking,
      );
    }

    const reservation = await this.reservationRepo.findOne({
      where: { membershipId, reserveDate: date },
      relations: ['seat', 'seat.room'],
    });
    if (!reservation) return null;

    return this.formatReservationResult(
      reservation.id,
      `${reservation.seat.room.code}-${reservation.seat.seatNo}`,
      reservation.seat.room.code,
      reservation.seat.seatNo,
      reservation.reserveDate,
      booking,
    );
  }

  async reserve(membershipId: string, dto: CreateReservationDto) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) throw new NotFoundException('会员卡不存在');

    const now = new Date();
    if (membership.endAt <= now) {
      throw new ForbiddenException('会员卡已过期');
    }

    const booking = this.buildBookingMeta(membership);
    const dates = this.getBookingDates(membership, dto.date);
    if (!dates.length) {
      throw new BadRequestException('会员卡已无可预约日期');
    }

    for (const date of dates) {
      this.assertDateInMembership(date, membership.startAt, membership.endAt);
    }

    const seat = await this.seatRepo.findOne({
      where: { id: dto.seatId },
      relations: ['room'],
    });
    if (!seat) throw new NotFoundException('座位不存在');
    if (!seat.bookable) throw new BadRequestException('该座位暂不可预约');

    const existingOnDates = await this.reservationRepo.find({
      where: { seatId: dto.seatId, reserveDate: In(dates) },
    });
    const conflict = existingOnDates.find((r) => r.membershipId !== membershipId);
    if (conflict) {
      throw new BadRequestException(
        booking.multiDay
          ? `该座位在 ${conflict.reserveDate} 已被预约，无法固定`
          : '该座位已被预约',
      );
    }

    await this.reservationRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(Reservation);
      for (const date of dates) {
        let reservation = await repo.findOne({
          where: { membershipId, reserveDate: date },
        });
        if (reservation) {
          reservation.seatId = dto.seatId;
        } else {
          reservation = repo.create({
            membershipId,
            seatId: dto.seatId,
            reserveDate: date,
          });
        }
        await repo.save(reservation);
      }
    });

    const today = this.todayDateStr();
    const displayDate = dates.includes(today) ? today : dates[0];
    const saved = await this.reservationRepo.findOne({
      where: { membershipId, reserveDate: displayDate },
    });

    return this.formatReservationResult(
      saved?.id || dto.seatId,
      `${seat.room.code}-${seat.seatNo}`,
      seat.room.code,
      seat.seatNo,
      displayDate,
      booking,
    );
  }

  async setSeatBookable(seatId: string, bookable: boolean) {
    const seat = await this.seatRepo.findOne({
      where: { id: seatId },
      relations: ['room'],
    });
    if (!seat) throw new NotFoundException('座位不存在');
    seat.bookable = bookable;
    await this.seatRepo.save(seat);
    return {
      id: seat.id,
      seatNo: seat.seatNo,
      roomCode: seat.room.code,
      bookable: seat.bookable,
      label: `${seat.room.code}-${seat.seatNo}`,
    };
  }

  async listAllSeatsForAdmin() {
    const rooms = await this.roomService.listRoomsWithSeats();
    return rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      seats: room.seats
        .sort((a, b) => a.seatNo - b.seatNo)
        .map((s) => ({
          id: s.id,
          seatNo: s.seatNo,
          label: `${room.code}-${s.seatNo}`,
          bookable: s.bookable,
        })),
    }));
  }

  private async mapCodesByMembership(membershipIds: string[]) {
    if (!membershipIds.length) return new Map<string, RedemptionCode>();
    const codes = await this.codeRepo.find({
      where: { membershipId: In(membershipIds) },
      relations: ['product'],
    });
    return new Map(
      codes
        .filter((c) => c.membershipId)
        .map((c) => [c.membershipId!, c]),
    );
  }

  private formatAdminReservationItem(
    r: Reservation,
    codeByMembership: Map<string, RedemptionCode>,
  ) {
    const code = codeByMembership.get(r.membershipId);
    return {
      id: r.id,
      reserveDate: r.reserveDate,
      seatLabel: `${r.seat.room.code}-${r.seat.seatNo}`,
      roomCode: r.seat.room.code,
      seatNo: r.seat.seatNo,
      code: code?.code ?? null,
      productName: code?.product?.name ?? null,
      note: code?.note ?? null,
    };
  }

  /** 管理端：按日期查看各座位对应的兑换码 */
  async listReservationsByDateForAdmin(dateStr: string) {
    const reservations = await this.reservationRepo.find({
      where: { reserveDate: dateStr },
      relations: ['seat', 'seat.room'],
    });

    reservations.sort((a, b) => {
      const roomCmp = a.seat.room.code.localeCompare(b.seat.room.code);
      if (roomCmp !== 0) return roomCmp;
      return a.seat.seatNo - b.seat.seatNo;
    });

    const membershipIds = [...new Set(reservations.map((r) => r.membershipId))];
    const codeByMembership = await this.mapCodesByMembership(membershipIds);

    return {
      date: dateStr,
      items: reservations.map((r) =>
        this.formatAdminReservationItem(r, codeByMembership),
      ),
    };
  }

  /** 管理端：按兑换码查看预约的日期与座位 */
  async listReservationsByCodeForAdmin(codeInput: string) {
    const code = codeInput.replace(/\D/g, '');
    if (!/^\d{11}$/.test(code)) {
      throw new BadRequestException('兑换码必须为11位纯数字');
    }

    const record = await this.codeRepo.findOne({
      where: { code },
      relations: ['product'],
    });
    if (!record) throw new NotFoundException('兑换码不存在');

    if (!record.membershipId) {
      return {
        code: record.code,
        status: record.status,
        productName: record.product.name,
        note: record.note ?? null,
        items: [],
      };
    }

    const reservations = await this.reservationRepo.find({
      where: { membershipId: record.membershipId },
      relations: ['seat', 'seat.room'],
      order: { reserveDate: 'ASC' },
    });

    return {
      code: record.code,
      status: record.status,
      productName: record.product.name,
      note: record.note ?? null,
      items: reservations.map((r) => ({
        id: r.id,
        reserveDate: r.reserveDate,
        seatLabel: `${r.seat.room.code}-${r.seat.seatNo}`,
        roomCode: r.seat.room.code,
        seatNo: r.seat.seatNo,
      })),
    };
  }

  /** 管理端：取消单条预约 */
  async cancelReservationForAdmin(id: string) {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: ['seat', 'seat.room'],
    });
    if (!reservation) throw new NotFoundException('预约不存在');

    await this.reservationRepo.remove(reservation);

    return {
      id: reservation.id,
      reserveDate: reservation.reserveDate,
      seatLabel: `${reservation.seat.room.code}-${reservation.seat.seatNo}`,
    };
  }
}
