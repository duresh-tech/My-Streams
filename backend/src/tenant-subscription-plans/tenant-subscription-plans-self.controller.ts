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
import { TenantSubscriptionPlansService } from './tenant-subscription-plans.service';
import {
  CreateTenantSubscriptionPlanSelfDto,
  UpdateTenantSubscriptionPlanSelfDto,
} from './dto/tenant-subscription-plan.dto';
import { TenantSubscriptionPlanListQueryDto } from './dto/tenant-subscription-plan-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const PLAN_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'SUB-MR8NZ6OO-C0CB',
  name: 'HD Starter',
  description: '1 stream, HD quality, 30 days',
  subscriptionFor: 'STREAM',
  maxStreams: 1,
  maxPlaySession: 2,
  maxServerStream: null,
  features: ['HD quality', 'Catch-up TV'],
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
};

@ApiTags('Tenant / Subscription Plans')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/subscription-plans')
export class TenantSubscriptionPlansSelfController {
  constructor(private readonly plansService: TenantSubscriptionPlansService) {}

  @Get()
  @RequireTenantPermissions('tenant-subscription-plans:list')
  @ApiOperation({
    summary: "List your business's subscription plans",
    description: "Scoped to the caller's business.",
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
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantSubscriptionPlanListQueryDto,
  ) {
    return this.plansService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-subscription-plans:view')
  @ApiOperation({ summary: 'Get one of your subscription plans by id' })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan detail.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.plansService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-subscription-plans:create')
  @ApiOperation({
    summary: 'Create a subscription plan for your business',
    description:
      "The business is taken from the caller's mapping and is not part of the request body. " +
      'Plan names are unique per business; a null limit means unlimited.',
  })
  @ApiResponse({ status: 201, description: 'Plan created.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Duplicate name, or a limit that does not apply.' })
  create(
    @CurrentTenantUser() user: TenantAuthUser,
    @Body() dto: CreateTenantSubscriptionPlanSelfDto,
  ) {
    return this.plansService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-subscription-plans:update')
  @ApiOperation({
    summary: 'Update one of your subscription plans',
    description:
      'subscriptionFor cannot be changed - the limits are type-specific. Create a new plan ' +
      'instead.',
  })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan updated.', schema: { example: PLAN_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionPlanSelfDto,
  ) {
    return this.plansService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-subscription-plans:delete')
  @ApiOperation({ summary: 'Soft-delete one of your subscription plans' })
  @ApiParam({ name: 'id', description: 'Plan UUIDv7' })
  @ApiResponse({ status: 200, description: 'Plan deleted.', schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.plansService.removeForTenantUser(user.id, id);
  }
}
