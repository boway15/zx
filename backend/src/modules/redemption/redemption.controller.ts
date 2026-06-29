import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RedemptionService } from './redemption.service';
import { CreateRedemptionCodeDto, RedeemCodeDto } from './redemption.dto';
import { AdminAuthGuard } from '../../common/guards/auth.guards';
import { CurrentAdmin } from '../../common/decorators/current-user.decorator';
import { RedemptionCodeStatus } from '../../entities/redemption-code.entity';

@Controller('redemption')
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  /** 免登录：预览兑换码（首次激活前确认信息） */
  @Post('preview')
  async preview(@Body() dto: RedeemCodeDto) {
    const data = await this.redemptionService.previewCode(dto.code);
    return { success: true, data };
  }

  /** 免登录：输入兑换码 */
  @Post('access')
  async access(@Body() dto: RedeemCodeDto) {
    const data = await this.redemptionService.accessByCode(dto.code);
    return { success: true, data, message: '验证成功' };
  }

  @Post('admin')
  @UseGuards(AdminAuthGuard)
  async create(
    @CurrentAdmin() admin: { id: string },
    @Body() dto: CreateRedemptionCodeDto,
  ) {
    const data = await this.redemptionService.create(admin.id, dto);
    return { success: true, data, message: '兑换码已生成，请发送给用户' };
  }

  @Get('admin')
  @UseGuards(AdminAuthGuard)
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: RedemptionCodeStatus,
    @Query('code') code?: string,
  ) {
    const data = await this.redemptionService.list(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      status,
      code,
    );
    return { success: true, data };
  }

  @Post('admin/:id/revoke')
  @UseGuards(AdminAuthGuard)
  async revoke(@Param('id') id: string) {
    const data = await this.redemptionService.revoke(id);
    return { success: true, data, message: '已作废' };
  }
}
