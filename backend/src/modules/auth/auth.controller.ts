import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AdminLoginDto, GuestLoginDto, WechatCallbackDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('wechat/url')
  getWechatUrl(@Query('redirect') redirect?: string) {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const redirectUri = redirect || `${baseUrl}/auth/callback`;
    return {
      success: true,
      data: { url: this.authService.getWechatAuthUrl(redirectUri) },
    };
  }

  @Get('wechat/callback')
  async wechatCallback(@Query() query: WechatCallbackDto, @Res() res: Response) {
    const { code } = query;
    const result = await this.authService.wechatLogin(code);
    const frontendUrl = this.configService.get<string>('app.baseUrl');
    res.redirect(`${frontendUrl}/login?token=${result.accessToken}`);
  }

  @Post('wechat/login')
  async wechatLogin(@Body() body: WechatCallbackDto) {
    const result = await this.authService.wechatLogin(body.code);
    return { success: true, data: result };
  }

  @Post('guest/login')
  async guestLogin(@Body() body: GuestLoginDto) {
    const result = await this.authService.guestLogin(body.phone, body.nickname);
    return { success: true, data: result };
  }

  @Post('admin/login')
  async adminLogin(@Body() body: AdminLoginDto) {
    const result = await this.authService.adminLogin(body.username, body.password);
    return { success: true, data: result };
  }
}
