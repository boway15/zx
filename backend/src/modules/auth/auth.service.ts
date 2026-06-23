import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service';
import { Admin } from '../../entities/admin.entity';

interface WechatTokenResponse {
  access_token?: string;
  openid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
  ) {}

  getWechatAuthUrl(redirectUri: string, state?: string): string {
    const appId = this.configService.get<string>('wechat.appId');
    const encoded = encodeURIComponent(redirectUri);
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encoded}&response_type=code&scope=snsapi_base&state=${state || 'zxs'}#wechat_redirect`;
  }

  async wechatLogin(code: string) {
    const appId = this.configService.get<string>('wechat.appId');
    const appSecret = this.configService.get<string>('wechat.appSecret');

    if (!appId || !appSecret) {
      const mockMode =
        this.configService.get<boolean>('wechat.mockPay') ||
        process.env.DEV_AUTH === 'true';
      if (mockMode) {
        const user = await this.userService.createOrUpdate(
          `dev_${code || 'test_openid'}`,
          '开发测试用户',
        );
        return this.signUserToken(user.id);
      }
      throw new BadRequestException('微信配置未完成');
    }

    const { data } = await axios.get<WechatTokenResponse>(
      'https://api.weixin.qq.com/sns/oauth2/access_token',
      {
        params: {
          appid: appId,
          secret: appSecret,
          code,
          grant_type: 'authorization_code',
        },
      },
    );

    if (data.errcode || !data.openid) {
      throw new UnauthorizedException(data.errmsg || '微信授权失败');
    }

    const user = await this.userService.createOrUpdate(data.openid);
    return this.signUserToken(user.id);
  }

  async guestLogin(phone: string, nickname?: string) {
    const normalized = phone.replace(/\s/g, '');
    if (!/^1\d{10}$/.test(normalized)) {
      throw new BadRequestException('请输入正确的手机号');
    }
    const user = await this.userService.createOrUpdateByPhone(normalized, nickname);
    return this.signUserToken(user.id);
  }

  signMembershipToken(membershipId: string, expiresAt: Date) {
    const ttlSec = Math.max(
      60,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    const token = this.jwtService.sign(
      { sub: membershipId, type: 'membership' },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: ttlSec,
      },
    );
    return { accessToken: token, tokenType: 'Bearer' };
  }

  signUserToken(userId: string) {
    const token = this.jwtService.sign(
      { sub: userId, type: 'user' },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn'),
      },
    );
    return { accessToken: token, tokenType: 'Bearer' };
  }

  async adminLogin(username: string, password: string) {
    const admin = await this.adminRepo.findOne({ where: { username } });
    if (!admin) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const token = this.jwtService.sign(
      { sub: admin.id, type: 'admin' },
      {
        secret: this.configService.get<string>('jwt.adminSecret'),
        expiresIn: this.configService.get<string>('jwt.adminExpiresIn'),
      },
    );
    return { accessToken: token, tokenType: 'Bearer', username: admin.username };
  }

  async ensureDefaultAdmin() {
    const count = await this.adminRepo.count();
    if (count > 0) return;
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const admin = this.adminRepo.create({
      username: 'admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
    });
    await this.adminRepo.save(admin);
  }
}
