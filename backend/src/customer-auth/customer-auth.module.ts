import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({})],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerJwtStrategy],
  // Exported so the tenant-side "Login as customer" route can mint a customer
  // session without duplicating the token logic.
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
