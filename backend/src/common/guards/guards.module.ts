import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipModule } from '../../modules/membership/membership.module';
import { RedemptionCode } from '../../entities/redemption-code.entity';
import {
  JwtAuthGuard,
  AdminAuthGuard,
  OptionalJwtAuthGuard,
  MembershipAuthGuard,
  AdminOnlyGuard,
} from './auth.guards';

@Global()
@Module({
  imports: [MembershipModule, TypeOrmModule.forFeature([RedemptionCode])],
  providers: [
    JwtAuthGuard,
    AdminAuthGuard,
    OptionalJwtAuthGuard,
    MembershipAuthGuard,
    AdminOnlyGuard,
  ],
  exports: [
    JwtAuthGuard,
    AdminAuthGuard,
    OptionalJwtAuthGuard,
    MembershipAuthGuard,
    AdminOnlyGuard,
  ],
})
export class GuardsModule {}
