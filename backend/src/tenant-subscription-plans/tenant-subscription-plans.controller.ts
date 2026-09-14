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
import { TenantSubscriptionPlansService } from './tenant-subscription-plans.service';
import {
  CreateTenantSubscriptionPlanDto,
  UpdateTenantSubscriptionPlanDto,
} from './dto/tenant-subscription-plan.dto';
import { TenantSubscriptionPlanListQueryDto } from './dto/tenant-subscription-plan-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const PLAN_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'SUB-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  name: 'HD Starter',
  description: '1 stream, HD quality, 30 days',
  subscriptionFor: 'STREAM',
  maxStreams: 1,
  maxPlaySession: 2,
  maxServerStream: null,
  features: ['HD quality', 'Catch-up TV', 'Email support'],
  playbackProtocols: ['hls', 'dash'],
  durationValue: 1,
  durationUnit: 'MONTH',
  orginalPrice: 299,
  customerPrice: 249,
  resellerPrice: 199,
  showCustomer: true,
  showReseller: false,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

@ApiTags('System / Tenant Subscription Plans')
@ApiBearerAuth()
@Controller('system/tenant-subscription-plans')
export class TenantSubscriptionPlansController {
  constructor(private readonly plansService: TenantSubscriptionPlansService) {}

  @Get()
  @RequirePermissions('tenant-subscription-plans:list')
  @ApiOperation({
    summary: 'List tenant subscription plans',
    description:
      'Paginated, searchable, filterable list. Filters: subscriptionFor, status, business, and ' +
      'the showCustomer / showReseller visibility flags. Excludes deleted rows unless ' +
      'status=DELETED is requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated plan list.',
    schema: {
      example: {
        items: [PLAN_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantSubscriptionPlanListQueryDto) {
    return this.plansService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-subscription-plans:view')
  @ApiOperation({ summary: 'Get a subscription plan by id' })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan detail.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-subscription-plans:create')
  @ApiOperation({
    summary: 'Create a subscription plan',
    description:
      'Plan names are unique per business. A null limit means unlimited, which is not the same ' +
      'as 0. maxStreams applies to STREAM plans and maxServerStream to SERVER plans; supplying ' +
      'the wrong one is rejected rather than silently ignored. playbackProtocols are validated ' +
      'against the protocols the streaming servers actually support.',
  })
  @ApiResponse({ status: 201, description: 'Plan created.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Business missing, duplicate name, or mismatched limit.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantSubscriptionPlanDto) {
    return this.plansService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('tenant-subscription-plans:update')
  @ApiOperation({
    summary: 'Update a subscription plan',
    description:
      'subscriptionFor cannot be changed: the limits are type-specific, and anything already ' +
      'sold on the plan would change meaning. Create a new plan instead. A limit that does not ' +
      "apply to the plan's stored type is rejected.",
  })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan updated.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionPlanDto,
  ) {
    return this.plansService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('tenant-subscription-plans:delete')
  @ApiOperation({
    summary: 'Soft-delete a subscription plan',
    description:
      'Sets status=DELETED and records deletedAt/deletedBy. There is no restore endpoint for ' +
      'plans, so a deleted plan stays deleted; it remains visible with status=DELETED.',
  })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan deleted.', schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plansService.remove(id, user.id);
  }
}
