import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantAuthUser {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleKey: string;
  permissions: string[];
}

/** Injects the authenticated tenant user (populated by TenantJwtStrategy). */
export const CurrentTenantUser = createParamDecorator(
  (data: keyof TenantAuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: TenantAuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
