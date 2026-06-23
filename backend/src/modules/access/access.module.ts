import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessLog } from '../../entities/access-log.entity';
import { DoorPasscode } from '../../entities/door-passcode.entity';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { MembershipModule } from '../membership/membership.module';
import { TtlockModule } from '../ttlock/ttlock.module';
import { SettingsModule } from '../settings/settings.module';
import { SeatModule } from '../seat/seat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessLog, DoorPasscode]),
    MembershipModule,
    TtlockModule,
    SettingsModule,
    SeatModule,
  ],
  providers: [AccessService],
  controllers: [AccessController],
  exports: [AccessService],
})
export class AccessModule {}
