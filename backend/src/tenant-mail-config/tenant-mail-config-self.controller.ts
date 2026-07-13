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
import { TenantMailConfigService } from './tenant-mail-config.service';
import {
  CreateTenantMailConfigDto,
  TestTenantMailConfigDto,
  UpdateTenantMailConfigDto,
} from './dto/tenant-mail-config.dto';
import { TenantMailConfigListQueryDto } from './dto/tenant-mail-config-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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
  deletedAt: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

@ApiTags('Tenant / Mail Config')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/mail-config')
export class TenantMailConfigSelfController {
  constructor(private readonly tenantMailConfigService: TenantMailConfigService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-mail-config:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a mail config.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantMailConfigService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-mail-config:list')
  @ApiOperation({
    summary: "List the caller's own mail configs",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated mail config list.',
    schema: {
      example: {
        items: [TENANT_MAIL_CONFIG_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantMailConfigListQueryDto,
  ) {
    return this.tenantMailConfigService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-mail-config:view')
  @ApiOperation({ summary: "Get one of the caller's own mail configs by id" })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config detail.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantMailConfigService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-mail-config:create')
  @ApiOperation({
    summary: "Create a mail config for one of the caller's own businesses",
    description:
      'tenantBusinessId must be one of the businesses the caller is actively mapped to. ' +
      'Only one mail config is allowed per tenant account - delete the existing one first to replace it.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mail config created.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'The caller already has a mail config.' })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantMailConfigDto) {
    return this.tenantMailConfigService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-mail-config:update')
  @ApiOperation({
    summary: "Update one of the caller's own mail configs",
    description: 'Omit mailPassword to keep the currently stored password unchanged.',
  })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config updated.',
    schema: { example: TENANT_MAIL_CONFIG_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantMailConfigDto,
  ) {
    return this.tenantMailConfigService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-mail-config:delete')
  @ApiOperation({
    summary: "Soft-delete one of the caller's own mail configs",
    description: 'Sets deletedAt; the row is excluded from all list/view/update/test-email operations thereafter.',
  })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mail config deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantMailConfigService.removeForTenantUser(user.id, id);
  }

  @Post(':id/test-email')
  @RequireTenantPermissions('tenant-mail-config:test')
  @ApiOperation({
    summary: "Send a test email using one of the caller's own mail configs",
    description: 'Attempts a real SMTP send using the stored settings; reports the SMTP error on failure.',
  })
  @ApiParam({ name: 'id', description: 'Mail config UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Test email sent.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'Mail config incomplete or the SMTP send failed.' })
  @ApiResponse({ status: 404, description: 'Mail config not found.' })
  sendTestEmail(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: TestTenantMailConfigDto,
  ) {
    return this.tenantMailConfigService.sendTestEmailForTenantUser(user.id, id, dto);
  }
}
