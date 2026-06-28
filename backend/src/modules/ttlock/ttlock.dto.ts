import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTtlockConfigDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  apiBase?: string;

  @IsOptional()
  @IsBoolean()
  mockUnlock?: boolean;
}
