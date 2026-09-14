import {
  Req,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantCustomersService } from './tenant-customers.service';
import { CustomerAuthService } from '../customer-auth/customer-auth.service';
import {
  ChangeTenantCustomerStatusDto,
  CreateTenantCustomerDto,
  UpdateTenantCustomerDto,
} from './dto/tenant-customer.dto';
import { TenantCustomerListQueryDto } from './dto/tenant-customer-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_CUSTOMER_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'TNC-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  customerCode: 'CUST-0001',
  fName: 'Ravi',
  lName: 'Kumar',
  gender: 'MALE',
  primaryMobile: '9876543210',
  customerType: 'INDIVIDUAL',
  addressLine1: '221B Baker Street',
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

@ApiTags('Tenant / Customers')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/customers')
export class TenantCustomersSelfController {
  constructor(
    private readonly tenantCustomersService: TenantCustomersService,
    private readonly customerAuthService: CustomerAuthService,
  ) {}

  @Post(':id/login-as')
  @RequireTenantPermissions('tenant-customers:login-as')
  @ApiOperation({
    summary: 'Sign in as one of your customers',
    description:
      'Issues a customer-portal session for the given customer without their password, for ' +
      'support. Restricted to customers of the caller\'s own business, and refused for a ' +
      'customer with no portal username. The session is marked impersonated so the portal can ' +
      'show that someone is acting on the account rather than the customer themselves.',
  })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Customer session issued.',
    schema: {
      example: {
        customer: { id: '019f357b-c211-71a0-9062-adc0f927a222', customerCode: 'CUS001', fName: 'John' },
        impersonated: true,
        redirectTo: '/customer/streams',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        csrfToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Another business\'s customer, or no portal username.' })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  async loginAsCustomer(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    // The business is resolved from the caller, so a tenant admin can only ever
    // impersonate within their own tenant.
    const tenantBusinessId = await this.tenantCustomersService.getMappedBusinessIdFor(user.id);
    return this.customerAuthService.loginAs(
      id,
      tenantBusinessId,
      (req as Request & { deviceType?: string }).deviceType ?? 'website',
    );
  }

  @Get('businesses')
  @RequireTenantPermissions('tenant-customers:view')
  @ApiOperation({ summary: "List the caller's own mapped businesses" })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantCustomersService.listMappedBusinesses(user.id);
  }

  @Get('deleted')
  @RequireTenantPermissions('tenant-customers:view_deleted')
  @ApiOperation({ summary: "List the caller's own soft-deleted customers" })
  findDeleted(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantCustomerListQueryDto) {
    return this.tenantCustomersService.findDeletedForTenantUser(user.id, query);
  }

  @Get('export')
  @RequireTenantPermissions('tenant-customers:export')
  @ApiOperation({ summary: "Export the caller's own customers as CSV" })
  @ApiResponse({ status: 200, description: 'CSV file stream.' })
  async exportCsv(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantCustomerListQueryDto,
    @Res() res: Response,
  ) {
    const rows = await this.tenantCustomersService.exportRowsForTenantUser(user.id, query);
    const csv = stringify(rows, { header: true, columns: this.tenantCustomersService.csvColumns as string[] });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tenant-customers.csv"',
    });
    res.send(csv);
  }

  @Post('import')
  @RequireTenantPermissions('tenant-customers:import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: "Import customers from a CSV file into one of the caller's own businesses",
    description:
      'tenantBusinessId column is optional if the caller is mapped to exactly one business. ' +
      'Each row is validated independently - a bad row is skipped and reported, the rest still import.',
  })
  async importCsv(@CurrentTenantUser() user: TenantAuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[];
    return this.tenantCustomersService.importRowsForTenantUser(user.id, rows);
  }

  @Get()
  @RequireTenantPermissions('tenant-customers:view')
  @ApiOperation({ summary: "List the caller's own customers" })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [TENANT_CUSTOMER_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantCustomerListQueryDto) {
    return this.tenantCustomersService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-customers:view')
  @ApiOperation({ summary: "Get one of the caller's own customers by id" })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantCustomersService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-customers:create')
  @ApiOperation({ summary: "Create a customer for one of the caller's own businesses" })
  @ApiResponse({ status: 201, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantCustomerDto) {
    return this.tenantCustomersService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-customers:update')
  @ApiOperation({ summary: "Update one of the caller's own customers" })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantCustomerDto,
  ) {
    return this.tenantCustomersService.updateForTenantUser(user.id, id, dto);
  }

  @Patch(':id/status')
  @RequireTenantPermissions('tenant-customers:change_status')
  @ApiOperation({ summary: "Change one of the caller's own customer's status" })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  changeStatus(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeTenantCustomerStatusDto,
  ) {
    return this.tenantCustomersService.changeStatusForTenantUser(user.id, id, dto.status);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-customers:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own customers" })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantCustomersService.removeForTenantUser(user.id, id);
  }

  @Patch(':id/restore')
  @RequireTenantPermissions('tenant-customers:restore')
  @ApiOperation({ summary: "Restore one of the caller's own soft-deleted customers" })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found or not deleted.' })
  restore(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantCustomersService.restoreForTenantUser(user.id, id);
  }
}
