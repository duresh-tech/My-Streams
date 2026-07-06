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

@ApiTags('System / Users')
@ApiBearerAuth()
@Controller({ path: 'system/users', version: '1' })
export class SystemUsersController {
  constructor(private readonly systemUsersService: SystemUsersService) {}

  @Get()
  @RequirePermissions('system-users:read')
  @ApiOperation({
    summary: 'List system users',
    description: 'Paginated, searchable list of non-deleted system users.',
  })
  @ApiResponse({ status: 200, description: 'Paginated user list.' })
  findAll(@Query() query: ListQueryDto) {
    return this.systemUsersService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @RequirePermissions('system-users:read')
  @ApiOperation({ summary: 'Get a system user by id' })
  @ApiParam({ name: 'id', description: 'User UUIDv7' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  findOne(@Param('id') id: string) {
    return this.systemUsersService.findOne(id);
  }

  @Post()
  @RequirePermissions('system-users:create')
  @ApiOperation({ summary: 'Create a system user' })
  @ApiResponse({ status: 201, description: 'User created.' })
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
  @ApiResponse({ status: 400, description: 'Cannot delete own account.' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.systemUsersService.remove(id, user.id);
  }
}
