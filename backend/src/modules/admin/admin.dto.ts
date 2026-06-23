import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ManualGrantDto {
  @IsString()
  openid!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
