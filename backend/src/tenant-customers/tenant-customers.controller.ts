import {
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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import {
  ChangeTenantCustomerStatusDto,
  CreateTenantCustomerDto,
  UpdateTenantCustomerDto,
} from './dto/tenant-customer.dto';
import { TenantCustomerListQueryDto } from './dto/tenant-customer-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_CUSTOMER_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'TNC-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  customerCode: 'CUST-0001',
  fName: 'Ravi',
  lName: 'Kumar',
  fatherName: 'Suresh Kumar',
  gender: 'MALE',
  dateOfBirth: '1990-05-12',
  primaryMobile: '9876543210',
  secondaryMobile: null,
  email: 'ravi.kumar@example.com',
  customerType: 'INDIVIDUAL',
  place: 'Sector 12',
  street: 'Baker Street',
  addressLine1: '221B Baker Street',
  addressLine2: null,
  city: 'New Delhi',
  state: 'Delhi',
  country: 'India',
  pincode: '110001',
  latitude: 28.6139,
  longitude: 77.209,
  customerPicture: 'general/019f357c-d489.jpg',
  idProofType: 'Aadhaar',
  idProofNumber: '1234-5678-9012',
  idProofFile: 'general/019f357c-d490.pdf',
  taxType: 'GSTIN',
  taxNumber: '07AAACR5055K1Z8',
  notifyViaSMS: true,
  notifyViaWhatsApp: true,
  notifyViaRCS: false,
  allowPortalAccess: true,
  remark: 'Preferred customer',
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

@ApiTags('System / Tenant Customers')
@ApiBearerAuth()
@Controller('system/tenant-customers')
export class TenantCustomersController {
  constructor(private readonly tenantCustomersService: TenantCustomersService) {}

  @Get('deleted')
  @RequirePermissions('tenant-customers:view_deleted')
  @ApiOperation({
    summary: 'List soft-deleted tenant customers',
    description: 'Only returns rows with status=DELETED, regardless of any status filter given.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [{ ...TENANT_CUSTOMER_EXAMPLE, status: 'DELETED' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findDeleted(@Query() query: TenantCustomerListQueryDto) {
    return this.tenantCustomersService.findDeleted(query);
  }

  @Get('export')
  @RequirePermissions('tenant-customers:export')
  @ApiOperation({
    summary: 'Export tenant customers as CSV',
    description: 'Exports the full filtered set (ignores pagination) as a CSV attachment.',
  })
  @ApiResponse({ status: 200, description: 'CSV file stream.' })
  async exportCsv(@Query() query: TenantCustomerListQueryDto, @Res() res: Response) {
    const rows = await this.tenantCustomersService.exportRows(query);
    const csv = stringify(rows, { header: true, columns: this.tenantCustomersService.csvColumns as string[] });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tenant-customers.csv"',
    });
    res.send(csv);
  }

  @Post('import')
  @RequirePermissions('tenant-customers:import')
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
    summary: 'Import tenant customers from a CSV file',
    description:
      'Each row is validated independently - a bad row is skipped and reported, the rest still import. ' +
      'Requires a tenantBusinessId column since rows may span multiple businesses.',
  })
  @ApiResponse({
    status: 201,
    schema: { example: { created: 8, skipped: 1, errors: [{ row: 5, error: 'Customer code "CUST-0001" is already used for this business' }] } },
  })
  async importCsv(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[];
    return this.tenantCustomersService.importRows(rows, async (parsedBusinessId) => {
      if (!parsedBusinessId) {
        throw new BadRequestException('tenantBusinessId column is required for every row');
      }
      return parsedBusinessId;
    });
  }

  @Get()
  @RequirePermissions('tenant-customers:view')
  @ApiOperation({
    summary: 'List tenant customers',
    description: 'Paginated, searchable, filterable, sortable. Always excludes soft-deleted rows.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [TENANT_CUSTOMER_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@Query() query: TenantCustomerListQueryDto) {
    return this.tenantCustomersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-customers:view')
  @ApiOperation({ summary: 'Get a tenant customer by id' })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantCustomersService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-customers:create')
  @ApiOperation({
    summary: 'Create a tenant customer',
    description: 'place and street are free text (up to 150 characters each).',
  })
  @ApiResponse({ status: 201, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Business/place/street mismatch, or customerCode already used.' })
  create(@Body() dto: CreateTenantCustomerDto) {
    return this.tenantCustomersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-customers:update')
  @ApiOperation({ summary: 'Update a tenant customer' })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantCustomerDto) {
    return this.tenantCustomersService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('tenant-customers:change_status')
  @ApiOperation({
    summary: "Change a tenant customer's status",
    description: 'Restricted to ACTIVE, INACTIVE, or BLOCKED - deletion stays on the DELETE/restore endpoints.',
  })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeTenantCustomerStatusDto) {
    return this.tenantCustomersService.changeStatus(id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions('tenant-customers:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant customer',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  remove(@Param('id') id: string) {
    return this.tenantCustomersService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-customers:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant customer',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Customer UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TENANT_CUSTOMER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Customer not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantCustomersService.restore(id);
  }
}
