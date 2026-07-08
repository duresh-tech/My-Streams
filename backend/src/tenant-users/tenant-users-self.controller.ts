import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantUsersService } from './tenant-users.service';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
} from './dto/tenant-user.dto';
import { ListQueryDto } from '../common/dto/query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_USER_EXAMPLE = {
  id: '019f357c-d489-74a9-8490-1f82e745b199',
  systemCode: 'TNU-MR8NZ6VD-74F8',
  fName: 'Jane Doe',
  username: 'jane.doe',
  email: 'jane@example.com',
  phone: '+1 555 0100',
  avatarPath: null,
  roleId: '019f357c-ec94-7148-8367-a55253ab1152',
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  role: {
    id: '019f357c-ec94-7148-8367-a55253ab1152',
    roleKey: 'TENANT_ADMIN',
    displayName: 'Tenant Administrator',
  },
};

@ApiTags('Tenant / Users')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/users')
export class TenantUsersSelfController {
  constructor(private readonly tenantUsersService: TenantUsersService) {}

  @Get('roles')
  @RequireTenantPermissions('tenant-users:read')
  @ApiOperation({
    summary: 'List roles assignable to tenant users',
    description: 'Used to populate the role picker when creating/editing a team member.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active, tenant-visible roles.',
    schema: {
      example: [{ id: '019f357c-ec94-7148-8367-a55253ab1152', roleKey: 'TENANT_ADMIN', displayName: 'Tenant Administrator' }],
    },
  })
  listRoles() {
    return this.tenantUsersService.listAssignableRoles();
  }

  @Get()
  @RequireTenantPermissions('tenant-users:read')
  @ApiOperation({
    summary: "List the caller's own business team members",
    description: 'Scoped to tenant users mapped to the same business as the caller.',
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
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: ListQueryDto) {
    return this.tenantUsersService.findAllForTenantUser(user.id, query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-users:read')
  @ApiOperation({ summary: "Get one of the caller's own business team members by id" })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user found.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant user not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantUsersService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-users:create')
  @ApiOperation({
    summary: 'Create a team member for the caller\'s own business',
    description:
      'roleId must reference a role with visibleToTenants=true. The new user is ' +
      'automatically mapped to the caller\'s own business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant user created.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Username or email already in use.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantUserDto) {
    return this.tenantUsersService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-users:update')
  @ApiOperation({
    summary: "Update one of the caller's own business team members",
    description: 'Passing password re-hashes it with Argon2id.',
  })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user updated.',
    schema: { example: TENANT_USER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant user not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantUserDto,
  ) {
    return this.tenantUsersService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-users:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own business team members" })
  @ApiParam({ name: 'id', description: 'Tenant user UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant user deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'Cannot delete your own account.' })
  @ApiResponse({ status: 404, description: 'Tenant user not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantUsersService.removeForTenantUser(user.id, id);
  }
}
