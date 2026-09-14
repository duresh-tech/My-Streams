import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ListQueryDto } from '../common/dto/query.dto';

const ROLE_LIST_ITEM_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'ROL-MR8NZ6OO-C0CB',
  roleKey: 'TENANT_SUPER_ADMIN',
  displayName: 'Tenant Super Admin',
  isSystem: false,
  visibleToTenants: true,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  _count: { systemUsers: 2, rolePermissions: 5 },
};

const ROLE_DETAIL_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'ROL-MR8NZ6OO-C0CB',
  roleKey: 'TENANT_SUPER_ADMIN',
  displayName: 'Tenant Super Admin',
  isSystem: false,
  visibleToTenants: true,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  permissions: [
    {
      id: '019f357b-d244-70f7-a929-7123838b953d',
      systemCode: 'PRM-MR8NZ6F9-9038',
      displayName: 'Delete Roles',
      moduleName: 'roles',
      permissionKey: 'roles:delete',
      description: 'delete access for roles',
      isSystem: false,
      status: 'ACTIVE',
      createdAt: 1783308735,
      updatedAt: 1783308735,
      deletedAt: null,
    },
  ],
};

@ApiTags('System / Roles')
@ApiBearerAuth()
@Controller('system/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'List roles',
    description: 'Paginated, searchable list of non-deleted roles with counts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated role list.',
    schema: {
      example: {
        items: [ROLE_LIST_ITEM_EXAMPLE],
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: ListQueryDto) {
    return this.rolesService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  @ApiParam({ name: 'id', description: 'Role UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Role with resolved permissions.',
    schema: { example: ROLE_DETAIL_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions('roles:create')
  @ApiOperation({
    summary: 'Create a role',
    description: 'roleKey must be UPPER_SNAKE_CASE (ex. TENANT_SUPER_ADMIN).',
  })
  @ApiResponse({
    status: 201,
    description: 'Role created.',
    schema: { example: ROLE_DETAIL_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Role key already exists.' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('roles:update')
  @ApiOperation({
    summary: 'Update a role',
    description: 'Passing permissionIds replaces the full permission set.',
  })
  @ApiParam({ name: 'id', description: 'Role UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Role updated.',
    schema: { example: ROLE_DETAIL_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'System role key is immutable.' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  @ApiOperation({
    summary: 'Soft-delete a role',
    description:
      'Roles assigned to users cannot be deleted. System roles require the roles:delete_system permission.',
  })
  @ApiParam({ name: 'id', description: 'Role UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Role deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'Role in use.' })
  @ApiResponse({ status: 403, description: 'Missing roles:delete_system for a system role.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rolesService.remove(id, user.permissions.includes('roles:delete_system'));
  }
}
