import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  seatId!: string;

  /** 起始日 YYYY-MM-DD；待激活时必填，已激活时不可修改 */
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class PreviewSeatPlanDto {
  @IsUUID()
  seatId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class UpdateSeatBookableDto {
  @IsBoolean()
  bookable!: boolean;
}
