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
import { TenantUsersService } from './tenant-users.service';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
} from './dto/tenant-user.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ListQueryDto } from '../common/dto/query.dto';

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
  constructor(private readonly tenantUsersService: TenantUsersService) {}

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
}
