import { Controller, Get, UseGuards } from '@nestjs/common';
import { TtlockService } from './ttlock.service';
import { AdminAuthGuard } from '../../common/guards/auth.guards';

@Controller('ttlock')
export class TtlockController {
  constructor(private readonly ttlockService: TtlockService) {}

  @Get('status')
  @UseGuards(AdminAuthGuard)
  async status() {
    try {
      const locks = await this.ttlockService.listGatewayLocks();
      return { success: true, data: { connected: true, locks } };
    } catch (err) {
      return {
        success: false,
        data: { connected: false, error: (err as Error).message },
      };
    }
  }
}
