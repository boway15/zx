import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository, EntityManager } from 'typeorm';
import { Seat } from '../../entities/seat.entity';
import { Reservation } from '../../entities/reservation.entity';
import { RedemptionCode, RedemptionCodeStatus } from '../../entities/redemption-code.entity';
import { Membership, MembershipStatus } from '../../entities/membership.entity';
import { Product, ProductType } from '../../entities/product.entity';
import { MembershipService } from '../membership/membership.service';
import { RoomService } from './room.service';
import { CreateReservationDto, PreviewSeatPlanDto } from './seat.dto';
import { getNaturalDays } from '../../common/membership-duration';
import {
  enumerateDatesFromStart,
  getBookingHorizonDays,
  getMembershipDateRange,
  getSelectableStartDates,
} from '../../common/booking-schedule';

interface SeatAssignment {
  date: string;
  seatId: string;
  seatLabel: string;
  roomCode: string;
  seatNo: number;
  isPreferred: boolean;
}

type SeatWithMeta = Seat & { roomCode: string; label: string };

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

  private async getRedemptionForMembership(membershipId: string) {
    return this.codeRepo.findOne({ where: { membershipId } });
  }

  private async resolvePlannedDates(
    membership: Membership,
    startDate?: string,
  ): Promise<string[]> {
    if (!membership.product) {
      throw new BadRequestException('会员卡产品信息缺失');
    }

    if (membership.status === MembershipStatus.PENDING) {
      const code = await this.getRedemptionForMembership(membership.id);
      if (!code) throw new BadRequestException('兑换码信息缺失');

      const selectable = getSelectableStartDates(
        membership.product,
        code.redeemValidUntil,
      );
      const chosen = startDate || selectable[0];
      if (!chosen || !selectable.includes(chosen)) {
        throw new BadRequestException('请选择有效的起始日期');
      }
      return enumerateDatesFromStart(chosen, getNaturalDays(membership.product));
    }

    if (!membership.startAt) {
      throw new BadRequestException('会员卡尚未激活');
    }
    if (startDate) {
      const lockedStart = this.localDateStr(membership.startAt);
      if (startDate !== lockedStart) {
        throw new BadRequestException('预约日期不可修改');
      }
    }
    return getMembershipDateRange(membership.startAt, membership.product);
  }

  private buildBookingMeta(
    membership: Membership,
    plannedDates: string[],
    pending: boolean,
  ) {
    const multiDay = !!(membership.product && this.isMultiDayProduct(membership.product));
    return {
      pending,
      multiDay,
      productType: membership.product?.type || ProductType.DAY,
      productName: membership.product?.name || '',
      dateFrom: plannedDates[0] || null,
      dateTo: plannedDates[plannedDates.length - 1] || null,
      dayCount: plannedDates.length,
      canChangeDates: false,
    };
  }

  private formatReservationResult(
    id: string,
    seatLabel: string,
    roomCode: string,
    seatNo: number,
    reserveDate: string,
    booking: ReturnType<SeatService['buildBookingMeta']>,
    assignments?: SeatAssignment[],
    membership?: Membership,
    hasTodayReservation = true,
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
      hasTodayReservation,
      assignments: assignments?.map((a) => ({
        date: a.date,
        seatLabel: a.seatLabel,
        isPreferred: a.isPreferred,
      })),
      membership: membership
        ? {
            status: membership.status,
            pending: membership.status === MembershipStatus.PENDING,
            startAt: membership.startAt,
            endAt: membership.endAt,
          }
        : undefined,
    };
  }

  private async loadAllSeatsWithMeta(): Promise<{
    allSeats: SeatWithMeta[];
    seatById: Map<string, SeatWithMeta>;
  }> {
    const rooms = await this.roomService.listRoomsWithSeats();
    const allSeats: SeatWithMeta[] = rooms.flatMap((room) =>
      room.seats.map((seat) =>
        Object.assign(seat, {
          roomCode: room.code,
          label: `${room.code}-${seat.seatNo}`,
        }),
      ),
    );
    return { allSeats, seatById: new Map(allSeats.map((s) => [s.id, s])) };
  }

  async buildSeatPlan(
    preferredSeatId: string,
    dates: string[],
    membershipId: string,
  ): Promise<SeatAssignment[]> {
    const { allSeats, seatById } = await this.loadAllSeatsWithMeta();
    const preferred = seatById.get(preferredSeatId);
    if (!preferred) throw new NotFoundException('座位不存在');
    if (!preferred.bookable) throw new BadRequestException('该座位暂不可预约');

    const existing = await this.reservationRepo.find({
      where: { reserveDate: In(dates) },
    });

    const occupied = new Map<string, Set<string>>();
    for (const r of existing) {
      if (r.membershipId === membershipId) continue;
      if (!occupied.has(r.reserveDate)) occupied.set(r.reserveDate, new Set());
      occupied.get(r.reserveDate)!.add(r.seatId);
    }

    const assignments: SeatAssignment[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const taken = occupied.get(date) || new Set<string>();
      let chosen = preferred;

      if (taken.has(preferredSeatId)) {
        if (i === 0) {
          throw new BadRequestException(
            '预约首日该座位已被预约，请更换座位或起始日期',
          );
        }
        const fallback = allSeats.find((s) => s.bookable && !taken.has(s.id));
        if (!fallback) {
          throw new BadRequestException(`${date} 已无可用座位，请更换起始日或首选座位`);
        }
        chosen = fallback;
      }

      assignments.push({
        date,
        seatId: chosen.id,
        seatLabel: chosen.label,
        roomCode: chosen.roomCode,
        seatNo: chosen.seatNo,
        isPreferred: chosen.id === preferredSeatId,
      });
    }

    return assignments;
  }

  async previewSeatPlan(membershipId: string, dto: PreviewSeatPlanDto) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) throw new NotFoundException('会员卡不存在');

    const dates = await this.resolvePlannedDates(membership, dto.startDate);
    const assignments = await this.buildSeatPlan(dto.seatId, dates, membershipId);
    const pending = membership.status === MembershipStatus.PENDING;
    const booking = this.buildBookingMeta(membership, dates, pending);

    return {
      booking,
      assignments: assignments.map((a) => ({
        date: a.date,
        seatLabel: a.seatLabel,
        isPreferred: a.isPreferred,
      })),
      allSameSeat: assignments.every((a) => a.isPreferred),
    };
  }

  async getAvailability(startDate?: string, membershipId?: string) {
    const date = startDate || this.todayDateStr();
    let membership: Membership | null = null;
    let rangeDates = [date];
    let pending = false;
    let selectableStartDates: string[] = [];

    if (membershipId) {
      membership = await this.membershipService.findById(membershipId);
      if (membership) {
        pending = membership.status === MembershipStatus.PENDING;
        if (pending) {
          const code = await this.getRedemptionForMembership(membershipId);
          if (code && membership.product) {
            selectableStartDates = getSelectableStartDates(
              membership.product,
              code.redeemValidUntil,
            );
          }
          rangeDates = await this.resolvePlannedDates(membership, startDate);
        } else if (membership.startAt && membership.product) {
          rangeDates = getMembershipDateRange(membership.startAt, membership.product);
          selectableStartDates = rangeDates;
        }
      }
    }

    const today = this.todayDateStr();
    const viewDate =
      startDate && rangeDates.includes(startDate)
        ? startDate
        : rangeDates.includes(today)
          ? today
          : rangeDates[0] || today;

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

    const myReservations =
      membershipId && rangeDates.length
        ? await this.reservationRepo.find({
            where: { membershipId, reserveDate: In(rangeDates) },
          })
        : [];
    const mySeatByDate = new Map(myReservations.map((r) => [r.reserveDate, r.seatId]));

    const roomList = rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      seats: room.seats
        .sort((a, b) => a.seatNo - b.seatNo)
        .map((seat) => {
          const owners = seatDateOwner.get(seat.id);
          const checkDates = pending ? rangeDates : [viewDate];
          const firstDay = rangeDates[0];
          const firstDayOccupiedByOther =
            !!owners?.get(firstDay) && owners.get(firstDay) !== membershipId;
          const occupiedByOtherDates = checkDates.filter((d) => {
            const owner = owners?.get(d);
            return !!owner && owner !== membershipId;
          });
          let reservedByOther: boolean;
          let partiallyReservedByOther: boolean;
          if (pending) {
            const laterOccupiedByOther = rangeDates
              .slice(1)
              .some(
                (d) =>
                  !!owners?.get(d) && owners.get(d) !== membershipId,
              );
            reservedByOther = firstDayOccupiedByOther;
            partiallyReservedByOther =
              !firstDayOccupiedByOther && laterOccupiedByOther;
          } else {
            reservedByOther =
              occupiedByOtherDates.length === checkDates.length;
            partiallyReservedByOther =
              occupiedByOtherDates.length > 0 &&
              occupiedByOtherDates.length < checkDates.length;
          }
          const isMine =
            !!membershipId &&
            mySeatByDate.get(viewDate) === seat.id;
          const reserved = checkDates.some((d) => !!owners?.get(d));
          return {
            id: seat.id,
            seatNo: seat.seatNo,
            label: `${room.code}-${seat.seatNo}`,
            bookable: seat.bookable,
            reserved,
            isMine,
            reservedByOther,
            partiallyReservedByOther,
            available: seat.bookable && !reservedByOther,
          };
        }),
    }));

    return {
      booking: membership
        ? {
            ...this.buildBookingMeta(membership, rangeDates, pending),
            selectableStartDates,
            selectedStartDate: viewDate,
            bookingHorizonDays: membership.product
              ? getBookingHorizonDays(membership.product)
              : 7,
          }
        : {
            pending: false,
            multiDay: false,
            productType: ProductType.DAY,
            productName: '',
            dateFrom: date,
            dateTo: date,
            dayCount: 1,
            canChangeDates: false,
            selectableStartDates: [],
            selectedStartDate: date,
            bookingHorizonDays: 7,
          },
      rooms: roomList,
    };
  }

  async getMyReservation(membershipId: string, dateStr?: string) {
    const date = dateStr || this.todayDateStr();
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) return null;

    if (membership.status === MembershipStatus.PENDING) return null;

    const plannedDates = await this.resolvePlannedDates(membership);
    const booking = this.buildBookingMeta(membership, plannedDates, false);

    const rangeReservations = await this.reservationRepo.find({
      where: { membershipId, reserveDate: In(plannedDates) },
      relations: ['seat', 'seat.room'],
      order: { reserveDate: 'ASC' },
    });
    if (!rangeReservations.length) return null;

    const todayReservation = rangeReservations.find((r) => r.reserveDate === date);
    const ref = todayReservation || rangeReservations[0];
    const seat = ref.seat;
    const primarySeatId = rangeReservations[0].seatId;

    const assignments: SeatAssignment[] = rangeReservations.map((r) => ({
      date: r.reserveDate,
      seatId: r.seatId,
      seatLabel: `${r.seat.room.code}-${r.seat.seatNo}`,
      roomCode: r.seat.room.code,
      seatNo: r.seat.seatNo,
      isPreferred: r.seatId === primarySeatId,
    }));

    const displaySeat = todayReservation?.seat ?? seat;

    return this.formatReservationResult(
      ref.id,
      `${displaySeat.room.code}-${displaySeat.seatNo}`,
      displaySeat.room.code,
      displaySeat.seatNo,
      todayReservation?.reserveDate ?? ref.reserveDate,
      booking,
      assignments,
      membership,
      !!todayReservation,
    );
  }

  private async markRedemptionActivated(membershipId: string, em: EntityManager) {
    const codeRepo = em.getRepository(RedemptionCode);
    const code = await codeRepo.findOne({ where: { membershipId } });
    if (
      code &&
      (code.status === RedemptionCodeStatus.BOUND ||
        code.status === RedemptionCodeStatus.USED)
    ) {
      code.status = RedemptionCodeStatus.ACTIVATED;
      await codeRepo.save(code);
    }
  }

  async reserve(membershipId: string, dto: CreateReservationDto) {
    const membership = await this.membershipService.findById(membershipId);
    if (!membership) throw new NotFoundException('会员卡不存在');

    if (
      membership.status === MembershipStatus.ACTIVE &&
      membership.endAt &&
      membership.endAt <= new Date()
    ) {
      throw new ForbiddenException('会员卡已过期');
    }

    const dates = await this.resolvePlannedDates(membership, dto.startDate);
    const assignments = await this.buildSeatPlan(dto.seatId, dates, membershipId);
    const pending = membership.status === MembershipStatus.PENDING;

    let activeMembership = membership;

    await this.reservationRepo.manager.transaction(async (em) => {
      const reservationRepo = em.getRepository(Reservation);

      for (const item of assignments) {
        const conflict = await reservationRepo.findOne({
          where: { seatId: item.seatId, reserveDate: item.date },
        });
        if (conflict && conflict.membershipId !== membershipId) {
          throw new BadRequestException(
            `${item.date} 座位 ${item.seatLabel} 刚被他人预约，请重新选择`,
          );
        }
      }

      if (pending) {
        activeMembership = await this.membershipService.activateFromReservation(
          membershipId,
          dates[0],
          em,
        );
        await this.markRedemptionActivated(membershipId, em);
      }

      for (const item of assignments) {
        let reservation = await reservationRepo.findOne({
          where: { membershipId, reserveDate: item.date },
        });
        if (reservation) {
          reservation.seatId = item.seatId;
        } else {
          reservation = reservationRepo.create({
            membershipId,
            seatId: item.seatId,
            reserveDate: item.date,
          });
        }
        try {
          await reservationRepo.save(reservation);
        } catch (err) {
          if (
            err instanceof QueryFailedError &&
            (err as QueryFailedError & { driverError?: { code?: string } })
              .driverError?.code === '23505'
          ) {
            throw new BadRequestException(
              `${item.date} 座位 ${item.seatLabel} 刚被他人预约，请重新选择`,
            );
          }
          throw err;
        }
      }
    });

    const booking = this.buildBookingMeta(activeMembership, dates, false);
    const today = this.todayDateStr();
    const displayDate = dates.includes(today) ? today : dates[0];
    const displayAssignment =
      assignments.find((a) => a.date === displayDate) || assignments[0];

    return this.formatReservationResult(
      displayAssignment.seatId,
      displayAssignment.seatLabel,
      displayAssignment.roomCode,
      displayAssignment.seatNo,
      displayDate,
      booking,
      assignments,
      activeMembership,
      dates.includes(today),
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

    const membership = await this.membershipService.findById(record.membershipId);
    const activated =
      record.status === RedemptionCodeStatus.ACTIVATED ||
      (record.status === RedemptionCodeStatus.USED &&
        membership?.status === MembershipStatus.ACTIVE);

    return {
      code: record.code,
      status: record.status,
      productName: record.product.name,
      note: record.note ?? null,
      boundAt: record.usedAt ?? null,
      redeemValidUntil: record.redeemValidUntil,
      activatedAt: activated ? membership?.startAt ?? null : null,
      membershipEndAt: activated ? membership?.endAt ?? null : null,
      items: reservations.map((r) => ({
        id: r.id,
        reserveDate: r.reserveDate,
        seatLabel: `${r.seat.room.code}-${r.seat.seatNo}`,
        roomCode: r.seat.room.code,
        seatNo: r.seat.seatNo,
      })),
    };
  }

  async cancelAllReservationsByMembership(
    membershipId: string,
    em?: EntityManager,
  ): Promise<number> {
    const repo = em ? em.getRepository(Reservation) : this.reservationRepo;
    const result = await repo.delete({ membershipId });
    return result.affected ?? 0;
  }

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
