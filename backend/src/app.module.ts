import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodValidationPipe } from 'nestjs-zod';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { TenantAuthModule } from './tenant-auth/tenant-auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { SystemUsersModule } from './system-users/system-users.module';
import { TenantUsersModule } from './tenant-users/tenant-users.module';
import { TenantAccountModule } from './tenant-account/tenant-account.module';
import { TenantBusinessModule } from './tenant-business/tenant-business.module';
import { TenantMappedBusinessModule } from './tenant-mapped-business/tenant-mapped-business.module';
import { TenantTaxTypesModule } from './tenant-tax-types/tenant-tax-types.module';
import { TenantPaymentModesModule } from './tenant-payment-modes/tenant-payment-modes.module';
import { TenantFlussonicServersModule } from './tenant-flussonic-servers/tenant-flussonic-servers.module';
import { TenantStreamsModule } from './tenant-streams/tenant-streams.module';
import { PublicShareModule } from './public-share/public-share.module';
import { TenantSubscriptionPlansModule } from './tenant-subscription-plans/tenant-subscription-plans.module';
import { TenantCustomerServersModule } from './tenant-customer-servers/tenant-customer-servers.module';
import { TenantBillingModule } from './tenant-billing/tenant-billing.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { TenantInExCategoriesModule } from './tenant-in-ex-categories/tenant-in-ex-categories.module';
import { TenantIncomeExpensesModule } from './tenant-income-expenses/tenant-income-expenses.module';
import { TenantStreamEventsModule } from './tenant-stream-events/tenant-stream-events.module';
import { TenantMailConfigModule } from './tenant-mail-config/tenant-mail-config.module';
import { TenantCustomersModule } from './tenant-customers/tenant-customers.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TenantDashboardModule } from './tenant-dashboard/tenant-dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { TenantUploadsModule } from './tenant-uploads/tenant-uploads.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DeviceHeaderGuard } from './common/guards/device-header.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: parseInt(config.get('THROTTLE_TTL_MS', '60000'), 10),
            limit: parseInt(config.get('THROTTLE_LIMIT', '100'), 10),
          },
        ],
      }),
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    TenantAuthModule,
    PermissionsModule,
    RolesModule,
    SystemUsersModule,
    TenantUsersModule,
    TenantAccountModule,
    TenantBusinessModule,
    TenantMappedBusinessModule,
    TenantTaxTypesModule,
    TenantPaymentModesModule,
    TenantFlussonicServersModule,
    TenantStreamsModule,
    PublicShareModule,
    TenantSubscriptionPlansModule,
    TenantCustomerServersModule,
    TenantBillingModule,
    CustomerAuthModule,
    CustomerPortalModule,
    TenantInExCategoriesModule,
    TenantIncomeExpensesModule,
    TenantStreamEventsModule,
    TenantMailConfigModule,
    TenantCustomersModule,
    AppSettingsModule,
    DashboardModule,
    TenantDashboardModule,
    UploadsModule,
    TenantUploadsModule,
  ],
  providers: [
    // Order matters: throttle -> device header -> JWT -> RBAC
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: DeviceHeaderGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
