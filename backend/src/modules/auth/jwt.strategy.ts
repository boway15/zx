import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  type: 'user' | 'admin' | 'membership';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  validate(payload: JwtPayload) {
    if (payload.type === 'user') {
      return { id: payload.sub, type: payload.type };
    }
    if (payload.type === 'membership') {
      return { membershipId: payload.sub, type: payload.type };
    }
    throw new UnauthorizedException('无效的用户令牌');
  }
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.adminSecret'),
    });
  }

  validate(payload: JwtPayload) {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('无效的管理员令牌');
    }
    return { id: payload.sub, type: payload.type };
  }
}
