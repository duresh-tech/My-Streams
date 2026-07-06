import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TenantAuthController } from './tenant-auth.controller';
import { TenantAuthService } from './tenant-auth.service';
import { TenantJwtStrategy } from './strategies/tenant-jwt.strategy';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({})],
  controllers: [TenantAuthController],
  providers: [TenantAuthService, TenantJwtStrategy],
  exports: [TenantAuthService],
})
export class TenantAuthModule {}
