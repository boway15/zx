import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ProductType } from '../../entities/product.entity';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsEnum(ProductType)
  type!: ProductType;

  @IsInt()
  @Min(1)
  durationHours!: number;

  @IsInt()
  @Min(1)
  priceFen!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  priceFen?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
