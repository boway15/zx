import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SeatService } from './seat.service';
import { CreateReservationDto, PreviewSeatPlanDto, UpdateSeatBookableDto } from './seat.dto';
import { MembershipAuthGuard, AdminAuthGuard } from '../../common/guards/auth.guards';
import { CurrentMembership } from '../../common/decorators/current-user.decorator';

@Controller('seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  @Get('availability')
  @UseGuards(MembershipAuthGuard)
  async availability(
    @CurrentMembership() ctx: { membershipId: string },
    @Query('startDate') startDate?: string,
  ) {
    const data = await this.seatService.getAvailability(startDate, ctx.membershipId);
    return { success: true, data };
  }

  @Get('my')
  @UseGuards(MembershipAuthGuard)
  async myReservation(
    @CurrentMembership() ctx: { membershipId: string },
    @Query('date') date?: string,
  ) {
    const data = await this.seatService.getMyReservation(ctx.membershipId, date);
    return { success: true, data };
  }

  @Post('preview-plan')
  @UseGuards(MembershipAuthGuard)
  async previewPlan(
    @CurrentMembership() ctx: { membershipId: string },
    @Body() dto: PreviewSeatPlanDto,
  ) {
    const data = await this.seatService.previewSeatPlan(ctx.membershipId, dto);
    return { success: true, data };
  }

  @Post('reserve')
  @UseGuards(MembershipAuthGuard)
  async reserve(
    @CurrentMembership() ctx: { membershipId: string },
    @Body() dto: CreateReservationDto,
  ) {
    const data = await this.seatService.reserve(ctx.membershipId, dto);
    return { success: true, data, message: '预约成功' };
  }

  @Get('admin/all')
  @UseGuards(AdminAuthGuard)
  async adminList() {
    const data = await this.seatService.listAllSeatsForAdmin();
    return { success: true, data };
  }

  @Put('admin/:id/bookable')
  @UseGuards(AdminAuthGuard)
  async setBookable(
    @Param('id') id: string,
    @Body() dto: UpdateSeatBookableDto,
  ) {
    const data = await this.seatService.setSeatBookable(id, dto.bookable);
    return { success: true, data };
  }

  @Get('admin/reservations/by-date')
  @UseGuards(AdminAuthGuard)
  async adminReservationsByDate(@Query('date') date: string) {
    if (!date) {
      throw new BadRequestException('请指定日期');
    }
    const data = await this.seatService.listReservationsByDateForAdmin(date);
    return { success: true, data };
  }

  @Get('admin/reservations/by-code')
  @UseGuards(AdminAuthGuard)
  async adminReservationsByCode(@Query('code') code: string) {
    if (!code?.trim()) {
      throw new BadRequestException('请指定兑换码');
    }
    const data = await this.seatService.listReservationsByCodeForAdmin(code);
    return { success: true, data };
  }

  @Delete('admin/reservations/:id')
  @UseGuards(AdminAuthGuard)
  async adminCancelReservation(@Param('id') id: string) {
    const data = await this.seatService.cancelReservationForAdmin(id);
    return { success: true, data, message: '已取消预约' };
  }
}
