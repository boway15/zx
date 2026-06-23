import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { AdminController } from './admin.controller';
import { AccessModule } from '../access/access.module';
import { MembershipModule } from '../membership/membership.module';
import { UserModule } from '../user/user.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AccessModule,
    MembershipModule,
    UserModule,
    ProductModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
