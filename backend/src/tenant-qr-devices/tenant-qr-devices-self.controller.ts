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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantQrDevicesService } from './tenant-qr-devices.service';
import { CreateTenantQrDeviceDto, UpdateTenantQrDeviceDto } from './dto/tenant-qr-device.dto';
import { TenantQrDeviceListQueryDto } from './dto/tenant-qr-device-query.dto';
import { TenantQrDevicePaymentConfigDto } from './dto/tenant-qr-device-payment-config.dto';
import { TenantQrDevicePushDto } from './dto/tenant-qr-device-push.dto';
import { TenantQrDeviceSerialLogDto } from './dto/tenant-qr-device-serial-log.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / QR Devices')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/qr-devices')
export class TenantQrDevicesSelfController {
  constructor(private readonly devicesService: TenantQrDevicesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: "List the caller's own mapped businesses" })
  @ApiResponse({ status: 200, schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] } })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.devicesService.listMappedBusinesses(user.id);
  }

  @Get('places')
  @RequireTenantPermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: "List places for one of the caller's own businesses (device picker)" })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({ status: 200, schema: { example: [{ id: '019f357b-d398-73aa-9062-adc0f927a584', placeName: 'Warehouse - Sector 12' }] } })
  listPlaces(@CurrentTenantUser() user: TenantAuthUser, @Query('tenantBusinessId') tenantBusinessId: string) {
    return this.devicesService.listPlacesForTenantUser(user.id, tenantBusinessId);
  }

  @Get('counters')
  @RequireTenantPermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: "List counters for one of the caller's own businesses (device picker)" })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({ status: 200, schema: { example: [{ id: '019f357b-f012-73aa-9062-adc0f927a584', counterName: 'Counter 1', counterCode: 'CNT001' }] } })
  listCounters(@CurrentTenantUser() user: TenantAuthUser, @Query('tenantBusinessId') tenantBusinessId: string) {
    return this.devicesService.listCountersForTenantUser(user.id, tenantBusinessId);
  }

  @Get()
  @RequireTenantPermissions('tenant-qr-devices:list')
  @ApiOperation({ summary: "List the caller's own QR devices", description: 'Scoped to businesses the caller is actively mapped to.' })
  @ApiResponse({ status: 200, schema: { example: { items: [DEVICE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } } })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantQrDeviceListQueryDto) {
    return this.devicesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-qr-devices:view')
  @ApiOperation({ summary: "Get one of the caller's own QR devices by id" })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.devicesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-qr-devices:create')
  @ApiOperation({
    summary: "Register a QR device for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({ status: 201, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantQrDeviceDto) {
    return this.devicesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-qr-devices:update')
  @ApiOperation({ summary: "Update one of the caller's own QR devices (metadata only, not payment config)" })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantQrDeviceDto,
  ) {
    return this.devicesService.updateForTenantUser(user.id, id, dto);
  }

  @Patch(':id/payment-config')
  @RequireTenantPermissions('tenant-qr-devices:manage_payment_config')
  @ApiOperation({
    summary: "Update the UPI ID / collection mode for one of the caller's own devices",
    description: 'Split from the general update action so this permission can be withheld from staff who only manage device metadata. AUTOMATIC mode is rejected until Phase 2.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: DEVICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  updatePaymentConfig(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: TenantQrDevicePaymentConfigDto,
  ) {
    return this.devicesService.updatePaymentConfigForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-qr-devices:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own QR devices" })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.devicesService.removeForTenantUser(user.id, id);
  }

  @Post(':id/push')
  @RequireTenantPermissions('tenant-qr-devices:push')
  @ApiOperation({
    summary: 'Generate a payment QR for one of the caller\'s own devices',
    description: 'Phase 1: renders a UPI QR locally from the device\'s own VPA - does not yet push to physical hardware.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: PUSH_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'No UPI ID configured, or collection mode is not MANUAL.' })
  push(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: TenantQrDevicePushDto,
  ) {
    return this.devicesService.pushForTenantUser(user.id, id, dto);
  }

  @Post(':id/test')
  @RequireTenantPermissions('tenant-qr-devices:test')
  @ApiOperation({
    summary: "Dry-run a test QR for one of the caller's own devices",
    description: 'Renders a preview with a nominal amount without affecting lastPushAt.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: { ...PUSH_EXAMPLE, amount: 1, isTest: true } } })
  test(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.devicesService.testForTenantUser(user.id, id);
  }

  @Post(':id/log-serial')
  @RequireTenantPermissions('tenant-qr-devices:test')
  @ApiOperation({
    summary: "Log a Web Serial exchange the caller's browser performed against the physical device",
    description:
      'The backend never opens the device\'s COM port itself - the browser does that directly ' +
      '(Web Serial API) after push/test returns a QR, then reports the raw AT command/response here.',
  })
  @ApiParam({ name: 'id', description: 'Device UUIDv7' })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Device not found.' })
  logSerial(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: TenantQrDeviceSerialLogDto,
  ) {
    return this.devicesService.logSerialExchangeForTenantUser(user.id, id, dto);
  }
}
