import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderService } from './order.service';

describe('OrderService mockPay guard', () => {
  it('rejects mock pay when mock mode is disabled', async () => {
    const configService = {
      get: (key: string) => (key === 'wechat.mockPay' ? false : undefined),
    } as ConfigService;

    const service = new OrderService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      configService,
    );

    await expect(service.mockPay('order-id', 'user-id')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
