import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantBillingSettingsService } from './tenant-billing-settings.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { UpdateTenantBillingSettingsDto } from './dto/tenant-billing-settings.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

export const BILLING_SETTINGS_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  currency: 'INR',
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  invoiceDueDays: 7,
  renewalLeadDays: 7,
  graceDays: 3,
  activateOn: 'PAYMENT',
  defaultTaxTypeId: '019f357b-e001-7abc-9062-adc0f927a584',
  defaultTaxType: {
    id: '019f357b-e001-7abc-9062-adc0f927a584',
    taxName: 'GST 18%',
    calculationType: 'PERCENTAGE',
    value: 18,
    status: 'ACTIVE',
  },
  invoiceFooter: 'Thank you for your business.',
  lifecycleIntervalMinutes: 5,
  lifecyclePaused: false,
  lifecycleLastRunAt: 1783308900,
  lifecycleLastResult: null,
  nextInvoiceNumberPreview: 'INV-000001',
  invoiceNumberLocked: false,
  createdAt: 1783308735,
  updatedAt: 1783308735,
};

@ApiTags('Tenant / Billing Settings')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/billing-settings')
export class TenantBillingSettingsSelfController {
  constructor(
    private readonly settingsService: TenantBillingSettingsService,
    private readonly lifecycle: BillingLifecycleService,
  ) {}

  @Get('job')
  @RequireTenantPermissions('tenant-billing-settings:view')
  @ApiOperation({
    summary: "Your business's billing job: schedule, last run and next run",
    description:
      'The job marks lapsed subscriptions PAST_DUE and then SUSPENDED, and switches blocked customer ' +
      'streams off and covered ones back on. It runs for your business every intervalMinutes (set with ' +
      'PATCH lifecycleIntervalMinutes, one of intervalPresets) unless paused; nextRunAt is null while ' +
      'paused. lastResult is what the last run did, or its error.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing job status.',
    schema: {
      example: {
        intervalMinutes: 5,
        paused: false,
        running: false,
        lastRunAt: 1789303200,
        lastResult: {
          trigger: 'SCHEDULE',
          startedAt: 1789303200,
          finishedAt: 1789303202,
          pastDue: 0,
          suspended: 1,
          activated: 0,
          streamsDisabled: 2,
          streamsEnabled: 0,
          streamsBlocked: 3,
          streamsReDisabled: 1,
          streamsReEnabled: 0,
          failed: 0,
          error: null,
        },
        nextRunAt: 1789303500,
        intervalPresets: [1, 5, 10, 15, 30, 60, 360, 720, 1440],
      },
    },
  })
  jobStatus(@CurrentTenantUser() user: TenantAuthUser) {
    return this.lifecycle.statusForTenantUser(user.id);
  }

  @Post('job/run')
  @RequireTenantPermissions('tenant-billing-settings:update')
  @ApiOperation({
    summary: 'Run the billing job for your business now',
    description: 'Runs even while paused, and waits for the run to finish. Returns the updated job status.',
  })
  @ApiResponse({ status: 201, description: 'Run finished; job status.' })
  @ApiResponse({ status: 409, description: 'The job is already running for your business.' })
  runJob(@CurrentTenantUser() user: TenantAuthUser) {
    return this.lifecycle.runNowForTenantUser(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-billing-settings:view')
  @ApiOperation({
    summary: "Get your business's billing settings",
    description:
      'Created with defaults on first read, so there is no create endpoint. ' +
      'invoiceNumberLocked is true once any invoice has been issued, after which ' +
      'nextInvoiceNumber can no longer be changed.',
  })
  @ApiResponse({ status: 200, description: 'Billing settings.', schema: { example: BILLING_SETTINGS_EXAMPLE } })
  get(@CurrentTenantUser() user: TenantAuthUser) {
    return this.settingsService.getForTenantUser(user.id);
  }

  @Patch()
  @RequireTenantPermissions('tenant-billing-settings:update')
  @ApiOperation({
    summary: "Update your business's billing settings",
    description:
      'The business is taken from the caller. defaultTaxTypeId must be an ACTIVE tax type of ' +
      'your business, or null to clear it. lifecycleIntervalMinutes must be one of 1, 5, 10, 15, 30, ' +
      '60, 360, 720 or 1440; lifecyclePaused stops scheduled billing job runs.',
  })
  @ApiResponse({ status: 200, description: 'Billing settings updated.', schema: { example: BILLING_SETTINGS_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description: 'Unknown currency, invalid tax type, or invoice sequence already locked.',
  })
  update(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: UpdateTenantBillingSettingsDto) {
    return this.settingsService.updateForTenantUser(user.id, dto);
  }
}
