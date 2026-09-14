import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Customer-portal JWT guard, applied explicitly via @UseGuards() on customer
 * routes (which are also @Public() so the global system guard steps aside).
 */
@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard('jwt-customer') {}
