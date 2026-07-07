import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { TenantExpenseCategoriesModule } from './tenant-expense-categories/tenant-expense-categories.module';
import { TenantBusinessBranchesModule } from './tenant-business-branches/tenant-business-branches.module';
import { TenantNetworkProvidersModule } from './tenant-network-providers/tenant-network-providers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TenantDashboardModule } from './tenant-dashboard/tenant-dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DeviceHeaderGuard } from './common/guards/device-header.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    TenantExpenseCategoriesModule,
    TenantBusinessBranchesModule,
    TenantNetworkProvidersModule,
    DashboardModule,
    TenantDashboardModule,
    UploadsModule,
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
