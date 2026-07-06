import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { TenantUsersService } from './tenant-users.service';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
} from './dto/tenant-user.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ListQueryDto } from '../common/dto/query.dto';
import { TenantAuthService } from '../tenant-auth/tenant-auth.service';
import { TENANT_CSRF_COOKIE } from '../common/guards/tenant-csrf.guard';

const TENANT_REFRESH_COOKIE = 'tenant_refresh_token';

const TENANT_USER_EXAMPLE = {
  id: '019f357c-d489-74a9-8490-1f82e745b199',
  systemCode: 'TNU-MR8NZ6VD-74F8',
  fName: 'Test Tenant',
  username: 'tenantuser1',
  email: 'tenantuser1@example.com',
  roleId: '019f357c-ec94-7148-8367-a55253ab1152',
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  role: {
    id: '019f357c-ec94-7148-8367-a55253ab1152',
    roleKey: 'TENANT_SUPER_ADMIN',
    displayName: 'Tenant Super Admin',
  },
};

@ApiTags('System / Tenant Users')
@ApiBearerAuth()
@Controller('system/tenant-users')
export class TenantUsersController {
  constructor(
    private readonly tenantUsersService: TenantUsersService,
    private readonly tenantAuthService: TenantAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermissions('tenant-users:read')
  @ApiOperation({
    summary: 'List tenant users',
    description: 'Paginated, searchable list of non-deleted tenant users.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant user list.',
    schema: {
      example: {
        items: [TENANT_USER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: ListQueryDto) {
    return this.tenantUsersService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('tenant-users:read')
  @ApiOperation({ summary: 'Get a tenant user by id' })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user found.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant user not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantUsersService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-users:create')
  @ApiOperation({
    summary: 'Create a tenant user',
    description: 'roleId must reference a role with visibleToTenants=true.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant user created.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Username or email already in use.' })
  create(@Body() dto: CreateTenantUserDto) {
    return this.tenantUsersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-users:update')
  @ApiOperation({
    summary: 'Update a tenant user',
    description: 'Passing password re-hashes it with Argon2id.',
  })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user updated.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  update(@Param('id') id: string, @Body() dto: UpdateTenantUserDto) {
    return this.tenantUsersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-users:delete')
  @ApiOperation({ summary: 'Soft-delete a tenant user' })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user deleted.',
    schema: { example: { success: true } },
  })
  remove(@Param('id') id: string) {
    return this.tenantUsersService.remove(id);
  }

  @Post(':id/login-as')
  @RequirePermissions('tenant-users:login-as')
  @ApiOperation({
    summary: 'Log in as a tenant user',
    description:
      'Issues a tenant session for the given tenant user without their ' +
      'password, for system-admin impersonation. Sets tenant_refresh_token ' +
      'and tenant_csrf_token cookies (distinct from the system session\'s ' +
      'own cookies, so both sessions can coexist in the same browser).',
  })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant session issued.',
    schema: {
      example: {
        user: TENANT_USER_EXAMPLE,
        permissions: ['tenant-dashboard:view'],
        redirectTo: '/tenant/dashboard',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlm...',
        csrfToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Tenant user not found.' })
  @ApiResponse({ status: 401, description: 'Account inactive or role not tenant-visible.' })
  async loginAs(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tenantAuthService.loginAs(id, (req as any).deviceType);
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    res.cookie(TENANT_REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/tenant',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie(TENANT_CSRF_COOKIE, result.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    const { refreshToken, ...body } = result;
    return body;
  }
}
