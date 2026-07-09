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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantQrDevicesService } from './tenant-qr-devices.service';
import { CreateTenantQrDeviceDto, UpdateTenantQrDeviceDto } from './dto/tenant-qr-device.dto';
import { TenantQrDeviceListQueryDto } from './dto/tenant-qr-device-query.dto';
import { TenantQrDevicePaymentConfigDto } from './dto/tenant-qr-device-payment-config.dto';
import { TenantQrDevicePushDto } from './dto/tenant-qr-device-push.dto';
import { TenantQrDeviceEventListQueryDto } from './dto/tenant-qr-device-event-query.dto';
import { TenantQrDeviceSerialLogDto } from './dto/tenant-qr-device-serial-log.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const DEVICE_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'QRD-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantPlaceId: '019f357b-d398-73aa-9062-adc0f927a584',
  tenantCounterId: '019f357b-f012-73aa-9062-adc0f927a584',
  displayTemplateId: null,
  deviceCode: 'DQ12-01',
  deviceName: 'Front Counter Display',
  deviceModel: 'BONRIX_DQ12',
  collectionMode: 'MANUAL',
  upiVpa: 'acme@okhdfcbank',
  lastPushAt: 1783308735,
  lastTestAt: 1783308735,
  lastPaymentAt: null,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: { id: '019f357b-c211-71a0-9062-adc0f927a584', systemCode: 'TNB-MR8NZ6OO-C0CB', name: 'Acme Retail Pvt Ltd' },
  tenantPlace: { id: '019f357b-d398-73aa-9062-adc0f927a584', systemCode: 'PLC-MR8NZ6OO-C0CB', placeName: 'Warehouse - Sector 12' },
  tenantCounter: { id: '019f357b-f012-73aa-9062-adc0f927a584', systemCode: 'CTR-MR8NZ6OO-C0CB', counterName: 'Counter 1' },
  displayTemplate: null,
};

const PUSH_EXAMPLE = {
  qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSU...',
  upiLink: 'upi://pay?pa=acme%40okhdfcbank&pn=Acme+Retail+Pvt+Ltd&am=250.00&cu=INR',
  amount: 250,
  isTest: false,
};

@ApiTags('System / Tenant QR Devices')
@ApiBearerAuth()
@Controller('system/tenant-qr-devices')
export class TenantQrDevicesController {
  constructor(private readonly devicesService: TenantQrDevicesService) {}

  @Get('places')
  @RequirePermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: 'List places for a tenant business (device picker)' })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({ status: 200, schema: { example: [{ id: '019f357b-d398-73aa-9062-adc0f927a584', placeName: 'Warehouse - Sector 12' }] } })
  listPlaces(@Query('tenantBusinessId') tenantBusinessId: string) {
    return this.devicesService.listPlaces(tenantBusinessId);
  }

  @Get('counters')
  @RequirePermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: 'List counters for a tenant business (device picker)' })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({ status: 200, schema: { example: [{ id: '019f357b-f012-73aa-9062-adc0f927a584', counterName: 'Counter 1', counterCode: 'CNT001' }] } })
  listCounters(@Query('tenantBusinessId') tenantBusinessId: string) {
    return this.devicesService.listCounters(tenantBusinessId);
  }

  @Get('events')
  @RequirePermissions('tenant-qr-devices:view_events')
  @ApiOperation({
    summary: 'Debug event log across all tenant QR devices',
    description: 'Every push/test/config/error event, including raw AT command/response for hardware debugging (Phase 2).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        items: [
          {
            id: '019f357b-1234-73aa-9062-adc0f927a584',
            tenantQrDeviceId: '019f357b-e5b1-73aa-9062-adc0f927a584',
            eventType: 'PUSH_REQUESTED',
            amount: 250,
            message: 'Payment QR requested',
            atCommand: null,
            atResponse: null,
            payload: '{"upiLink":"upi://pay?..."}',
            createdAt: 1783308735,
            device: { id: '019f357b-e5b1-73aa-9062-adc0f927a584', systemCode: 'QRD-MR8NZ6OO-C0CB', deviceName: 'Front Counter Display', tenantBusiness: { id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' } },
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findEvents(@Query() query: TenantQrDeviceEventListQueryDto) {
    return this.devicesService.findEvents(query);
  }

  @Get()
  @RequirePermissions('tenant-qr-devices:list')
  @ApiOperation({
    summary: 'List tenant QR devices',
    description: 'Paginated, searchable, filterable, sortable. Excludes deleted rows unless status=DELETED is requested.',
  })
  @ApiResponse({ status: 200, schema: { example: { items: [DEVICE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } } })
  findAll(@Query() query: TenantQrDeviceListQueryDto) {
    return this.devicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-qr-devices:view')
  @ApiOperation({ summary: 'Get a tenant QR device by id' })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-qr-devices:create')
  @ApiOperation({
    summary: 'Register a tenant QR device',
    description: 'tenantPlaceId/tenantCounterId are optional but, if given, must belong to tenantBusinessId. deviceCode must be unique within the business.',
  })
  @ApiResponse({ status: 201, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Business/place/counter/template invalid, or deviceCode already used for this business.' })
  create(@Body() dto: CreateTenantQrDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-qr-devices:update')
  @ApiOperation({ summary: 'Update a tenant QR device (metadata only, not payment config)' })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantQrDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @Patch(':id/payment-config')
  @RequirePermissions('tenant-qr-devices:manage_payment_config')
  @ApiOperation({
    summary: "Update a device's UPI ID / collection mode",
    description: 'Split from the general update endpoint so this sensitive action can be gated separately. AUTOMATIC mode is rejected until Phase 2.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  updatePaymentConfig(@Param('id') id: string, @Body() dto: TenantQrDevicePaymentConfigDto) {
    return this.devicesService.updatePaymentConfig(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-qr-devices:delete')
  @ApiOperation({ summary: 'Soft-delete a tenant QR device' })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-qr-devices:restore')
  @ApiOperation({ summary: 'Restore a soft-deleted tenant QR device' })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.devicesService.restore(id);
  }

  @Post(':id/push')
  @RequirePermissions('tenant-qr-devices:push')
  @ApiOperation({
    summary: 'Generate a payment QR for this device',
    description: 'Phase 1: renders a UPI QR locally from the device\'s own VPA - does not yet push to physical hardware.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: PUSH_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'No UPI ID configured, or collection mode is not MANUAL.' })
  push(@Param('id') id: string, @Body() dto: TenantQrDevicePushDto) {
    return this.devicesService.push(id, dto);
  }

  @Post(':id/test')
  @RequirePermissions('tenant-qr-devices:test')
  @ApiOperation({
    summary: 'Dry-run a test QR for this device',
    description: 'Renders a preview with a nominal amount without affecting lastPushAt - lets staff verify VPA/template before going live.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: { ...PUSH_EXAMPLE, amount: 1, isTest: true } } })
  test(@Param('id') id: string) {
    return this.devicesService.test(id);
  }

  @Post(':id/log-serial')
  @RequirePermissions('tenant-qr-devices:test')
  @ApiOperation({
    summary: 'Log a Web Serial exchange the browser performed against the physical device',
    description:
      'The backend never opens the device\'s COM port itself - the tenant\'s browser does that ' +
      'directly (Web Serial API) after push/test returns a QR, then reports the raw AT command/response ' +
      'here so it lands in the debug event log alongside everything else.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  logSerial(@Param('id') id: string, @Body() dto: TenantQrDeviceSerialLogDto) {
    return this.devicesService.logSerialExchange(id, dto);
  }
}
