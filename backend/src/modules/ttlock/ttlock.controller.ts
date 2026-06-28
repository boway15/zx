import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { TtlockService } from './ttlock.service';
import { AdminAuthGuard } from '../../common/guards/auth.guards';
import { UpdateTtlockConfigDto } from './ttlock.dto';

@Controller('ttlock')
@UseGuards(AdminAuthGuard)
export class TtlockController {
  constructor(private readonly ttlockService: TtlockService) {}

  @Get('config')
  async getConfig() {
    const config = await this.ttlockService.getAdminConfig();
    return { success: true, data: config };
  }

  @Put('config')
  async updateConfig(@Body() dto: UpdateTtlockConfigDto) {
    const config = await this.ttlockService.saveAdminConfig(dto);
    return { success: true, data: config, message: '通通锁配置已保存' };
  }

  @Get('token-status')
  async tokenStatus() {
    const data = await this.ttlockService.getTokenStatus();
    return { success: true, data };
  }

  @Post('test-auth')
  async testAuth() {
    const data = await this.ttlockService.testAuth();
    return { success: data.success, data, message: data.message };
  }

  @Get('gateways')
  async gateways() {
    try {
      const list = await this.ttlockService.listGateways();
      return { success: true, data: list };
    } catch (err) {
      return { success: false, data: [], message: (err as Error).message };
    }
  }

  @Get('locks')
  async locks() {
    try {
      const list = await this.ttlockService.listLocks();
      return { success: true, data: list };
    } catch (err) {
      return { success: false, data: [], message: (err as Error).message };
    }
  }

  @Get('gateway-locks')
  async gatewayLocks(@Query('gatewayId') gatewayId?: string) {
    try {
      const id = gatewayId ? parseInt(gatewayId, 10) : undefined;
      const list = await this.ttlockService.listGatewayLocks(id);
      return { success: true, data: list };
    } catch (err) {
      return { success: false, data: [], message: (err as Error).message };
    }
  }

  @Get('status')
  async status() {
    try {
      const [config, tokenStatus, gateways, locks] = await Promise.all([
        this.ttlockService.getAdminConfig(),
        this.ttlockService.getTokenStatus(),
        this.ttlockService.listGateways().catch(() => []),
        this.ttlockService.listGatewayLocks().catch(() => []),
      ]);
      return {
        success: true,
        data: {
          connected: tokenStatus.valid,
          config,
          tokenStatus,
          gateways,
          locks,
        },
      };
    } catch (err) {
      return {
        success: false,
        data: { connected: false, error: (err as Error).message },
      };
    }
  }
}
