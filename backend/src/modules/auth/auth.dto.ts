import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class WechatCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class GuestLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^1\d{10}$/, { message: '请输入正确的手机号' })
  phone!: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
