import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TtlockToken } from '../../entities/ttlock-token.entity';
import { SettingsModule } from '../settings/settings.module';
import { TtlockService } from './ttlock.service';
import { TtlockController } from './ttlock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TtlockToken]), SettingsModule],
  providers: [TtlockService],
  controllers: [TtlockController],
  exports: [TtlockService],
})
export class TtlockModule {}
