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
import { SystemUsersService } from './system-users.service';
import {
  CreateSystemUserDto,
  UpdateSystemUserDto,
} from './dto/system-user.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ListQueryDto } from '../common/dto/query.dto';

const SYSTEM_USER_EXAMPLE = {
  id: '019f357c-d489-74a9-8490-1f82e745b199',
  systemCode: 'USR-MR8NZ6VD-74F8',
  fName: 'Test User',
  username: 'testuser1',
  email: 'testuser1@example.com',
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

@ApiTags('System / Users')
@ApiBearerAuth()
@Controller('system/users')
export class SystemUsersController {
  constructor(private readonly systemUsersService: SystemUsersService) {}

  @Get()
  @RequirePermissions('system-users:read')
  @ApiOperation({
    summary: 'List system users',
    description: 'Paginated, searchable list of non-deleted system users.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list.',
    schema: {
      example: {
        items: [SYSTEM_USER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: ListQueryDto) {
    return this.systemUsersService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('system-users:read')
  @ApiOperation({ summary: 'Get a system user by id' })
  @ApiParam({ name: 'id', description: 'User UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'System user found.',
    schema: { example: SYSTEM_USER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  findOne(@Param('id') id: string) {
    return this.systemUsersService.findOne(id);
  }

  @Post()
  @RequirePermissions('system-users:create')
  @ApiOperation({ summary: 'Create a system user' })
  @ApiResponse({
    status: 201,
    description: 'User created.',
    schema: { example: SYSTEM_USER_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Username or email already in use.' })
  create(@Body() dto: CreateSystemUserDto) {
    return this.systemUsersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('system-users:update')
  @ApiOperation({
    summary: 'Update a system user',
    description: 'Passing password re-hashes it with Argon2id.',
  })
  @ApiParam({ name: 'id', description: 'User UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'User updated.',
    schema: { example: SYSTEM_USER_EXAMPLE },
  })
  update(@Param('id') id: string, @Body() dto: UpdateSystemUserDto) {
    return this.systemUsersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('system-users:delete')
  @ApiOperation({
    summary: 'Soft-delete a system user',
    description: 'Also revokes all of the user\'s refresh tokens.',
  })
  @ApiParam({ name: 'id', description: 'User UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'User deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'Cannot delete own account.' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.systemUsersService.remove(id, user.id);
  }
}
