import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedemptionCode } from '../../entities/redemption-code.entity';
import { RedemptionService } from './redemption.service';
import { RedemptionController } from './redemption.controller';
import { ProductModule } from '../product/product.module';
import { MembershipModule } from '../membership/membership.module';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { SeatModule } from '../seat/seat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RedemptionCode]),
    ProductModule,
    MembershipModule,
    AuthModule,
    UserModule,
    SeatModule,
    forwardRef(() => AccessModule),
  ],
  providers: [RedemptionService],
  controllers: [RedemptionController],
  exports: [RedemptionService],
})
export class RedemptionModule {}
