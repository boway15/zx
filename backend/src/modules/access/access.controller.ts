import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AccessService } from './access.service';
import { MembershipAuthGuard, AdminAuthGuard } from '../../common/guards/auth.guards';
import { CurrentMembership } from '../../common/decorators/current-user.decorator';

@Controller('access')
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get('status')
  @UseGuards(MembershipAuthGuard)
  async status(@CurrentMembership() ctx: { membershipId: string }) {
    const data = await this.accessService.getMembershipStatus(ctx.membershipId);
    return { success: true, data };
  }

  @Post('unlock')
  @UseGuards(MembershipAuthGuard)
  async unlock(@CurrentMembership() ctx: { membershipId: string }) {
    const data = await this.accessService.unlockDoorByMembership(ctx.membershipId);
    return { success: true, data };
  }

  @Get('passcode')
  @UseGuards(MembershipAuthGuard)
  async passcode(@CurrentMembership() ctx: { membershipId: string }) {
    const data = await this.accessService.getPasscodeByMembership(ctx.membershipId);
    return { success: true, data };
  }

  @Post('admin/unlock')
  @UseGuards(AdminAuthGuard)
  async adminUnlock() {
    const data = await this.accessService.unlockByAdmin();
    return { success: true, data, message: data.message };
  }

  @Get('admin/temp-passcode')
  @UseGuards(AdminAuthGuard)
  async adminTempPasscode() {
    const data = await this.accessService.getAdminDailyPasscode();
    return { success: true, data };
  }

  @Get('admin/logs')
  @UseGuards(AdminAuthGuard)
  async logs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('code') code?: string,
  ) {
    const data = await this.accessService.listLogs(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      code,
    );
    return { success: true, data };
  }
}
