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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ListQueryDto } from '../common/dto/query.dto';

const PERMISSION_EXAMPLE = {
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
};

@ApiTags('System / Permissions')
@ApiBearerAuth()
@Controller('system/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions:read')
  @ApiOperation({
    summary: 'List permissions',
    description: 'Paginated, searchable list of non-deleted permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated permission list.',
    schema: {
      example: {
        items: [PERMISSION_EXAMPLE],
        meta: { total: 14, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: ListQueryDto) {
    return this.permissionsService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('permissions:read')
  @ApiOperation({ summary: 'Get a permission by id' })
  @ApiParam({ name: 'id', description: 'Permission UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Permission found.',
    schema: { example: PERMISSION_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Permission not found.' })
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Post()
  @RequirePermissions('permissions:create')
  @ApiOperation({
    summary: 'Create a permission',
    description: 'permissionKey format: `module:action` (ex. roles:delete).',
  })
  @ApiResponse({
    status: 201,
    description: 'Permission created.',
    schema: { example: PERMISSION_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Permission key already exists.' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('permissions:update')
  @ApiOperation({ summary: 'Update a permission' })
  @ApiParam({ name: 'id', description: 'Permission UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Permission updated.',
    schema: { example: { ...PERMISSION_EXAMPLE, displayName: 'Delete Roles Updated' } },
  })
  @ApiResponse({ status: 400, description: 'System permission key is immutable.' })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('permissions:delete')
  @ApiOperation({
    summary: 'Soft-delete a permission',
    description: 'System permissions (isSystem=true) cannot be deleted.',
  })
  @ApiParam({ name: 'id', description: 'Permission UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Permission deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System permissions cannot be deleted.' })
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
