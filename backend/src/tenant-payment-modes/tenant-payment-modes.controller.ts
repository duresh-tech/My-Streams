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
import { TenantPaymentModesService } from './tenant-payment-modes.service';
import {
  CreateTenantPaymentModeDto,
  UpdateTenantPaymentModeDto,
} from './dto/tenant-payment-mode.dto';
import { TenantPaymentModeListQueryDto } from './dto/tenant-payment-mode-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

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

@ApiTags('System / Tenant Payment Modes')
@ApiBearerAuth()
@Controller('system/tenant-payment-modes')
export class TenantPaymentModesController {
  constructor(private readonly tenantPaymentModesService: TenantPaymentModesService) {}

  @Get()
  @RequirePermissions('tenant-payment-modes:list')
  @ApiOperation({
    summary: 'List tenant payment modes',
    description:
      'Paginated, searchable, filterable, sortable list of tenant payment modes. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant payment mode list.',
    schema: {
      example: {
        items: [TENANT_PAYMENT_MODE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantPaymentModeListQueryDto) {
    return this.tenantPaymentModesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-payment-modes:view')
  @ApiOperation({ summary: 'Get a tenant payment mode by id' })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode detail.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantPaymentModesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-payment-modes:create')
  @ApiOperation({ summary: 'Create a tenant payment mode' })
  @ApiResponse({
    status: 201,
    description: 'Payment mode created.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantPaymentModeDto) {
    return this.tenantPaymentModesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-payment-modes:update')
  @ApiOperation({ summary: 'Update a tenant payment mode' })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode updated.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantPaymentModeDto) {
    return this.tenantPaymentModesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-payment-modes:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant payment mode',
    description:
      'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint. ' +
      'System payment modes (isSystem=true) require the tenant-payment-modes:delete_system permission.',
  })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 403, description: 'Missing tenant-payment-modes:delete_system for a system payment mode.' })
  @ApiResponse({ status: 404, description: 'Payment mode not found.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantPaymentModesService.remove(id, user.permissions.includes('tenant-payment-modes:delete_system'));
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-payment-modes:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant payment mode',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Payment mode UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Payment mode restored.',
    schema: { example: TENANT_PAYMENT_MODE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Payment mode not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantPaymentModesService.restore(id);
  }
}
