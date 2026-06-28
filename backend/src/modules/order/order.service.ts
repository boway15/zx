import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus } from '../../entities/order.entity';
import { ProductService } from '../product/product.service';
import { MembershipService } from '../membership/membership.service';
import { UserService } from '../user/user.service';
import { CreateOrderDto } from './order.dto';
import { parseWechatNotify } from '../../common/wechat-pay.util';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly productService: ProductService,
    private readonly membershipService: MembershipService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const product = await this.productService.findById(dto.productId);
    if (!product.enabled) {
      throw new BadRequestException('该卡类型已下架');
    }

    const outTradeNo = `ZXS${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const order = this.orderRepo.create({
      userId,
      productId: product.id,
      amountFen: product.priceFen,
      status: OrderStatus.PENDING,
      outTradeNo,
    });
    await this.orderRepo.save(order);

    const payParams = await this.createWechatPayParams(order, product.name);
    return { order, payParams };
  }

  private async createWechatPayParams(order: Order, description: string) {
    const mockPay = this.configService.get<boolean>('wechat.mockPay');
    if (mockPay) {
      return {
        mock: true,
        orderId: order.id,
        outTradeNo: order.outTradeNo,
        message: '开发模式：请调用 mock-pay 接口完成支付',
      };
    }

    const appId = this.configService.get<string>('wechat.appId');
    const mchId = this.configService.get<string>('wechat.mchId');
    const notifyUrl = this.configService.get<string>('wechat.notifyUrl');

    if (!appId || !mchId) {
      throw new BadRequestException('微信支付未配置');
    }

    const user = await this.userService.findById(order.userId);
    const openid = user?.openid;
    if (!openid) throw new BadRequestException('用户openid缺失');

    const prepayId = await this.unifiedOrder({
      appId,
      mchId,
      description,
      outTradeNo: order.outTradeNo,
      amountFen: order.amountFen,
      notifyUrl: notifyUrl!,
      openid,
    });

    order.wxPrepayId = prepayId;
    await this.orderRepo.save(order);

    return this.buildJsapiParams(appId, prepayId);
  }

  private async unifiedOrder(params: {
    appId: string;
    mchId: string;
    description: string;
    outTradeNo: string;
    amountFen: number;
    notifyUrl: string;
    openid: string;
  }): Promise<string> {
    const apiV3Key = this.configService.get<string>('wechat.apiV3Key');
    const body = {
      appid: params.appId,
      mchid: params.mchId,
      description: params.description,
      out_trade_no: params.outTradeNo,
      notify_url: params.notifyUrl,
      amount: { total: params.amountFen, currency: 'CNY' },
      payer: { openid: params.openid },
    };

    this.logger.log(`WeChat unified order: ${params.outTradeNo}`);
    return `prepay_${uuidv4().replace(/-/g, '')}`;
  }

  private buildJsapiParams(appId: string, prepayId: string) {
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = uuidv4().replace(/-/g, '');
    const packageStr = `prepay_id=${prepayId}`;
    const signType = 'RSA';

    return {
      appId,
      timeStamp,
      nonceStr,
      package: packageStr,
      signType,
      paySign: crypto.createHash('sha256').update(`${appId}${timeStamp}${nonceStr}${packageStr}`).digest('hex'),
    };
  }

  async handlePaymentSuccess(outTradeNo: string, transactionId: string) {
    const order = await this.orderRepo.findOne({
      where: { outTradeNo },
      relations: ['product'],
    });
    if (!order) throw new BadRequestException('订单不存在');
    if (order.status === OrderStatus.PAID) {
      return order;
    }

    order.status = OrderStatus.PAID;
    order.wxTransactionId = transactionId;
    order.paidAt = new Date();
    await this.orderRepo.save(order);

    await this.membershipService.activateFromOrder(
      order.userId,
      order.product,
      order.id,
    );

    return order;
  }

  async mockPay(orderId: string, userId: string) {
    if (!this.configService.get<boolean>('wechat.mockPay')) {
      throw new ForbiddenException('模拟支付未启用');
    }

    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
      relations: ['product'],
    });
    if (!order) throw new BadRequestException('订单不存在');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('订单状态不正确');
    }
    return this.handlePaymentSuccess(order.outTradeNo, `mock_${uuidv4()}`);
  }

  async handleWechatNotify(
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const mockPay = this.configService.get<boolean>('wechat.mockPay');
    if (mockPay) {
      const outTradeNo = String(body.out_trade_no || '');
      const transactionId = String(body.transaction_id || '');
      if (!outTradeNo || !transactionId) {
        throw new BadRequestException('Invalid mock notify payload');
      }
      await this.handlePaymentSuccess(outTradeNo, transactionId);
      return;
    }

    const apiV3Key = this.configService.get<string>('wechat.apiV3Key') || '';
    const verified = parseWechatNotify(
      body as Parameters<typeof parseWechatNotify>[0],
      headers,
      apiV3Key,
    );
    await this.handlePaymentSuccess(verified.outTradeNo, verified.transactionId);
  }

  async listByUser(userId: string) {
    return this.orderRepo.find({
      where: { userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
  }

  async listAll(page = 1, limit = 20) {
    const [items, total] = await this.orderRepo.findAndCount({
      relations: ['user', 'product'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(id: string) {
    return this.orderRepo.findOne({
      where: { id },
      relations: ['user', 'product'],
    });
  }
}
