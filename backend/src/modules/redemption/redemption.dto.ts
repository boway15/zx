import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { ExternalPlatform } from '../../entities/redemption-code.entity';

export class CreateRedemptionCodeDto {
  @IsUUID()
  productId!: string;

  /** 手工指定11位数字兑换码，留空则自动生成 */
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: '兑换码必须为11位纯数字' })
  code?: string;

  /** 兑换码激活期限（自然日，默认 7 天，截止最后一天 23:59） */
  @IsOptional()
  @IsInt()
  @Min(1)
  redeemValidDays?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(ExternalPlatform)
  externalPlatform?: ExternalPlatform;

  @IsOptional()
  @IsString()
  externalVoucher?: string;
}

export class RedeemCodeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$/, { message: '兑换码必须为11位纯数字' })
  code!: string;
}
