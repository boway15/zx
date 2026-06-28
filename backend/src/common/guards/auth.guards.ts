import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MembershipService } from '../../modules/membership/membership.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RedemptionCode,
  RedemptionCodeStatus,
} from '../../entities/redemption-code.entity';
import { MembershipStatus } from '../../entities/membership.entity';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {}

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error | null, user: T): T {
    return user;
  }
}

@Injectable()
export class MembershipAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly membershipService: MembershipService,
    @InjectRepository(RedemptionCode)
    private readonly codeRepo: Repository<RedemptionCode>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { membershipId?: string; type?: string };
    if (!user?.membershipId || user.type !== 'membership') {
      throw new UnauthorizedException('需要有效的兑换会话');
    }

    const membership = await this.membershipService.findById(user.membershipId);
    if (!membership) {
      throw new UnauthorizedException('会员卡不存在，请重新输入兑换码');
    }

    if (membership.status === MembershipStatus.EXPIRED) {
      throw new UnauthorizedException('会员卡已过期');
    }

    if (
      membership.status === MembershipStatus.ACTIVE &&
      membership.endAt &&
      membership.endAt <= new Date()
    ) {
      throw new UnauthorizedException('会员卡已过期');
    }

    if (membership.status === MembershipStatus.PENDING) {
      const code = await this.codeRepo.findOne({
        where: { membershipId: membership.id },
      });
      if (!code || code.redeemValidUntil < new Date()) {
        throw new UnauthorizedException('兑换码已过期，请联系管理员');
      }
      if (code.status === RedemptionCodeStatus.REVOKED) {
        throw new UnauthorizedException('兑换码已作废');
      }
    }

    return true;
  }
}

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.admin?.type === 'admin';
  }
}
