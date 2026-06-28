import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { validateProductionConfig } from './config/production-validation';
import { User } from './entities/user.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { Membership } from './entities/membership.entity';
import { AccessLog } from './entities/access-log.entity';
import { DoorPasscode } from './entities/door-passcode.entity';
import { TtlockToken } from './entities/ttlock-token.entity';
import { Admin } from './entities/admin.entity';
import { Setting } from './entities/setting.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { MembershipModule } from './modules/membership/membership.module';
import { AccessModule } from './modules/access/access.module';
import { TtlockModule } from './modules/ttlock/ttlock.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AdminModule } from './modules/admin/admin.module';
import { RedemptionCode } from './entities/redemption-code.entity';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { SeatModule } from './modules/seat/seat.module';
import { Room } from './entities/room.entity';
import { Seat } from './entities/seat.entity';
import { Reservation } from './entities/reservation.entity';
import { HealthController } from './health.controller';
import { GuardsModule } from './common/guards/guards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    GuardsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        entities: [
          User,
          Product,
          Order,
          Membership,
          AccessLog,
          DoorPasscode,
          TtlockToken,
          Admin,
          Setting,
          RedemptionCode,
          Room,
          Seat,
          Reservation,
        ],
        synchronize: process.env.DB_SYNC !== 'false',
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
    AuthModule,
    UserModule,
    ProductModule,
    OrderModule,
    MembershipModule,
    AccessModule,
    TtlockModule,
    SettingsModule,
    AdminModule,
    RedemptionModule,
    SeatModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    validateProductionConfig(this.configService);
  }
}
