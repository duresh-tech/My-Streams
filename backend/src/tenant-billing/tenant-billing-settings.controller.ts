import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantBillingSettingsService } from './tenant-billing-settings.service';
import { UpdateTenantBillingSettingsDto } from './dto/tenant-billing-settings.dto';
import { BILLING_SETTINGS_EXAMPLE } from './tenant-billing-settings-self.controller';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('System / Tenant Billing Settings')
@ApiBearerAuth()
@Controller('system/tenant-billing-settings')
export class TenantBillingSettingsController {
  constructor(private readonly settingsService: TenantBillingSettingsService) {}

  @Get(':tenantBusinessId')
  @RequirePermissions('tenant-billing-settings:view')
  @ApiOperation({
    summary: "Get a tenant business's billing settings",
    description: 'Created with defaults on first read, so there is no create endpoint.',
  })
  @ApiParam({ name: 'tenantBusinessId', description: 'Tenant business UUIDv7' })
  @ApiResponse({ status: 200, description: 'Billing settings.', schema: { example: BILLING_SETTINGS_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Business does not exist or is deleted.' })
  get(@CurrentUser() user: AuthUser, @Param('tenantBusinessId') tenantBusinessId: string) {
    return this.settingsService.get(tenantBusinessId, user.id);
  }

  @Patch(':tenantBusinessId')
  @RequirePermissions('tenant-billing-settings:update')
  @ApiOperation({
    summary: "Update a tenant business's billing settings",
    description:
      'defaultTaxTypeId must be an ACTIVE tax type of that business, or null to clear it. ' +
      'nextInvoiceNumber is refused once the business has issued an invoice.',
  })
  @ApiParam({ name: 'tenantBusinessId', description: 'Tenant business UUIDv7' })
  @ApiResponse({ status: 200, description: 'Billing settings updated.', schema: { example: BILLING_SETTINGS_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description: 'Unknown business or currency, invalid tax type, or invoice sequence already locked.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('tenantBusinessId') tenantBusinessId: string,
    @Body() dto: UpdateTenantBillingSettingsDto,
  ) {
    return this.settingsService.update(tenantBusinessId, dto, user.id);
  }
}
