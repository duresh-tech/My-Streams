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
import { ListQueryDto } from '../common/dto/query.dto';

@ApiTags('System / Roles')
@ApiBearerAuth()
@Controller({ path: 'system/roles', version: '1' })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'List roles',
    description: 'Paginated, searchable list of non-deleted roles with counts.',
  })
  @ApiResponse({ status: 200, description: 'Paginated role list.' })
  findAll(@Query() query: ListQueryDto) {
    return this.rolesService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  @ApiParam({ name: 'id', description: 'Role UUIDv7' })
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
  @ApiResponse({ status: 201, description: 'Role created.' })
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
  @ApiResponse({ status: 400, description: 'System role key is immutable.' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  @ApiOperation({
    summary: 'Soft-delete a role',
    description:
      'System roles and roles still assigned to users cannot be deleted.',
  })
  @ApiParam({ name: 'id', description: 'Role UUIDv7' })
  @ApiResponse({ status: 400, description: 'System role or role in use.' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
