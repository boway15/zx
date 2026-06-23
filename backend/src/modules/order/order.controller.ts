import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { OrderService } from './order.service';
import { CreateOrderDto, MockPayDto } from './order.dto';
import { JwtAuthGuard, AdminAuthGuard } from '../../common/guards/auth.guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOrderDto,
  ) {
    const result = await this.orderService.createOrder(user.id, dto);
    return { success: true, data: result };
  }

  @Post('mock-pay')
  @UseGuards(JwtAuthGuard)
  async mockPay(
    @CurrentUser() user: { id: string },
    @Body() dto: MockPayDto,
  ) {
    const order = await this.orderService.mockPay(dto.orderId, user.id);
    return { success: true, data: order, message: '模拟支付成功' };
  }

  @Post('wechat/notify')
  async wechatNotify(@Req() req: Request, @Headers() headers: Record<string, string>) {
    const body = req.body as { out_trade_no?: string; transaction_id?: string };
    if (body.out_trade_no && body.transaction_id) {
      await this.orderService.handlePaymentSuccess(body.out_trade_no, body.transaction_id);
    }
    return { code: 'SUCCESS', message: '成功' };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async myOrders(@CurrentUser() user: { id: string }) {
    const orders = await this.orderService.listByUser(user.id);
    return { success: true, data: orders };
  }

  @Get('admin')
  @UseGuards(AdminAuthGuard)
  async listAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.orderService.listAll(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
    return { success: true, data: result };
  }
}
