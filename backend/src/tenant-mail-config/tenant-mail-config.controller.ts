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
import { TenantMailConfigService } from './tenant-mail-config.service';
import {
  CreateTenantMailConfigDto,
  UpdateTenantMailConfigDto,
} from './dto/tenant-mail-config.dto';
import { TenantMailConfigListQueryDto } from './dto/tenant-mail-config-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_MAIL_CONFIG_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'MLC-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  mailDriver: 'SMTP',
  mailHost: 'smtp.mailtrap.io',
  mailPort: 587,
  mailUsername: 'no-reply@acmeretail.com',
  mailEncryption: 'TLS',
  fromMailAddress: 'no-reply@acmeretail.com',
  fromMailName: 'Acme Retail',
  hasPassword: true,
  createdAt: 1783308735,
  updatedAt: 1783308735,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

@ApiTags('System / Tenant Mail Config')
@ApiBearerAuth()
@Controller('system/tenant-mail-config')
export class TenantMailConfigController {
  constructor(private readonly tenantMailConfigService: TenantMailConfigService) {}

  @Get()
  @RequirePermissions('tenant-mail-config:list')
  @ApiOperation({
    summary: 'List tenant mail configs',
    description:
      'Paginated, searchable, filterable, sortable list of tenant mail (SMTP) configs. ' +
      'mailPassword is never returned; hasPassword indicates whether one is set.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant mail config list.',
    schema: {
      example: {
        items: [TENANT_MAIL_CONFIG_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantMailConfigListQueryDto) {
    return this.tenantMailConfigService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-mail-config:view')
  @ApiOperation({ summary: 'Get a tenant mail config by id' })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config detail.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantMailConfigService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-mail-config:create')
  @ApiOperation({ summary: 'Create a tenant mail config' })
  @ApiResponse({
    status: 201,
    description: 'Mail config created.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantMailConfigDto) {
    return this.tenantMailConfigService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-mail-config:update')
  @ApiOperation({
    summary: 'Update a tenant mail config',
    description: 'Omit mailPassword to keep the currently stored password unchanged.',
  })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config updated.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantMailConfigDto) {
    return this.tenantMailConfigService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-mail-config:delete')
  @ApiOperation({
    summary: 'Delete a tenant mail config',
    description: 'Hard-deletes the row; there is no soft-delete/restore for this resource.',
  })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  remove(@Param('id') id: string) {
    return this.tenantMailConfigService.remove(id);
  }
}
