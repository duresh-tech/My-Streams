import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The authenticated customer-portal principal.
 *
 * A customer has no role and no permission list: what they may do is decided by
 * their server assignments, not by a role. That is why there is no
 * `permissions` field here - adding one would invite permission checks that the
 * assignment model is the real authority for.
 */
export interface CustomerAuthUser {
  id: string;
  tenantBusinessId: string;
  customerCode: string;
  username: string;
  fName: string;
  /** True when a tenant admin is signed in as this customer. */
  impersonated: boolean;
}

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerAuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: CustomerAuthUser }>();
    return request.user;
  },
);
