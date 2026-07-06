import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Tenant JWT guard. Unlike the global system JwtAuthGuard, this is only ever
 * applied explicitly via @UseGuards() on tenant-auth routes (which are also
 * marked @Public() to skip the global system guard) — so no @Public()
 * short-circuit is needed here.
 */
@Injectable()
export class TenantJwtAuthGuard extends AuthGuard('jwt-tenant') {}
