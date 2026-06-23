import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TtlockToken } from '../../entities/ttlock-token.entity';
import { TtlockService } from './ttlock.service';
import { TtlockController } from './ttlock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TtlockToken])],
  providers: [TtlockService],
  controllers: [TtlockController],
  exports: [TtlockService],
})
export class TtlockModule {}
