import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  seatId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class UpdateSeatBookableDto {
  @IsBoolean()
  bookable!: boolean;
}
