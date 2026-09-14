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
import { TenantPaymentModesService } from './tenant-payment-modes.service';
import {
  CreateTenantPaymentModeDto,
  UpdateTenantPaymentModeDto,
} from './dto/tenant-payment-mode.dto';
import { TenantPaymentModeListQueryDto } from './dto/tenant-payment-mode-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_PAYMENT_MODE_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'PAY-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  paymentName: 'Cash',
  description: 'In-person cash payment',
  isSystem: false,
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

@ApiTags('Tenant / Payment Modes')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/payment-modes')
export class TenantPaymentModesSelfController {
  constructor(private readonly tenantPaymentModesService: TenantPaymentModesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-payment-modes:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a payment mode.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantPaymentModesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-payment-modes:list')
  @ApiOperation({
    summary: "List the caller's own payment modes",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated payment mode list.',
    schema: {
      example: {
        items: [TENANT_PAYMENT_MODE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantPaymentModeListQueryDto) {
    return this.tenantPaymentModesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-payment-modes:view')
  @ApiOperation({ summary: "Get one of the caller's own payment modes by id" })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode detail.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantPaymentModesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-payment-modes:create')
  @ApiOperation({
    summary: "Create a payment mode for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment mode created.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantPaymentModeDto) {
    return this.tenantPaymentModesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-payment-modes:update')
  @ApiOperation({ summary: "Update one of the caller's own payment modes" })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode updated.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantPaymentModeDto,
  ) {
    return this.tenantPaymentModesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-payment-modes:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own payment modes" })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System payment modes cannot be deleted.' })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantPaymentModesService.removeForTenantUser(
      user.id,
      id,
      user.permissions.includes('tenant-payment-modes:delete_system'),
    );
  }
}
