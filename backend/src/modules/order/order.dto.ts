import { IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  productId!: string;
}

export class MockPayDto {
  @IsUUID()
  orderId!: string;
}
