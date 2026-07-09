import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantQrDeviceDto, UpdateTenantQrDeviceDto } from './dto/tenant-qr-device.dto';
import { TenantQrDeviceListQueryDto } from './dto/tenant-qr-device-query.dto';
import { TenantQrDevicePaymentConfigDto } from './dto/tenant-qr-device-payment-config.dto';
import { TenantQrDevicePushDto } from './dto/tenant-qr-device-push.dto';
import { TenantQrDeviceEventListQueryDto } from './dto/tenant-qr-device-event-query.dto';
import { TenantQrDeviceSerialLogDto } from './dto/tenant-qr-device-serial-log.dto';

const DEVICE_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
  tenantPlace: { select: { id: true, systemCode: true, placeName: true } },
  tenantCounter: { select: { id: true, systemCode: true, counterName: true } },
  displayTemplate: {
    select: {
      id: true,
      templateName: true,
      backgroundImagePath: true,
      logoOverridePath: true,
      primaryColor: true,
      footerText: true,
    },
  },
};

const TEST_AMOUNT = 1;

@Injectable()
export class TenantQrDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantQrDeviceListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, tenantPlaceId, tenantCounterId, collectionMode, sortBy, sortOrder } =
      query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(tenantCounterId ? { tenantCounterId } : {}),
      ...(collectionMode ? { collectionMode } : {}),
      ...(search
        ? {
            OR: [
              { deviceName: { contains: search } },
              { deviceCode: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantQrDevice.findMany({
        where,
        include: DEVICE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantQrDevice.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: DEVICE_INCLUDE,
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async create(dto: CreateTenantQrDeviceDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId) await this.assertPlaceBelongsToBusiness(dto.tenantPlaceId, dto.tenantBusinessId);
    if (dto.tenantCounterId) await this.assertCounterBelongsToBusiness(dto.tenantCounterId, dto.tenantBusinessId);
    if (dto.displayTemplateId) await this.assertTemplateUsable(dto.displayTemplateId, dto.tenantBusinessId);
    await this.assertDeviceCodeUnique(dto.tenantBusinessId, dto.deviceCode);

    const timestamp = now();
    const device = await this.prisma.tenantQrDevice.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('QRD'),
        tenantBusinessId: dto.tenantBusinessId,
        tenantPlaceId: dto.tenantPlaceId,
        tenantCounterId: dto.tenantCounterId,
        displayTemplateId: dto.displayTemplateId,
        deviceCode: dto.deviceCode,
        deviceName: dto.deviceName,
        deviceModel: dto.deviceModel,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: DEVICE_INCLUDE,
    });
    await this.logEvent(device.id, 'CREATED', { message: `Device "${device.deviceName}" registered` });
    return device;
  }

  async update(id: string, dto: UpdateTenantQrDeviceDto) {
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!device) throw new NotFoundException('Device not found');

    const effectiveBusinessId = dto.tenantBusinessId ?? device.tenantBusinessId;
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId) await this.assertPlaceBelongsToBusiness(dto.tenantPlaceId, effectiveBusinessId);
    if (dto.tenantCounterId) await this.assertCounterBelongsToBusiness(dto.tenantCounterId, effectiveBusinessId);
    if (dto.displayTemplateId) await this.assertTemplateUsable(dto.displayTemplateId, effectiveBusinessId);
    if (dto.deviceCode || dto.tenantBusinessId) {
      await this.assertDeviceCodeUnique(effectiveBusinessId, dto.deviceCode ?? device.deviceCode, id);
    }

    const updated = await this.prisma.tenantQrDevice.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: DEVICE_INCLUDE,
    });
    await this.logEvent(id, 'CONFIG_UPDATED', { message: 'Device configuration updated' });
    return updated;
  }

  async remove(id: string) {
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!device) throw new NotFoundException('Device not found');

    const timestamp = now();
    await this.prisma.tenantQrDevice.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!device) throw new NotFoundException('Device not found or not deleted');
    return this.prisma.tenantQrDevice.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: DEVICE_INCLUDE,
    });
  }

  async updatePaymentConfig(id: string, dto: TenantQrDevicePaymentConfigDto) {
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!device) throw new NotFoundException('Device not found');

    const updated = await this.prisma.tenantQrDevice.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: DEVICE_INCLUDE,
    });
    const changed = [
      dto.upiVpa !== undefined ? 'upiVpa' : null,
      dto.collectionMode !== undefined ? 'collectionMode' : null,
    ].filter(Boolean);
    await this.logEvent(id, 'CONFIG_UPDATED', { message: `Payment config updated (${changed.join(', ')})` });
    return updated;
  }

  /** Phase 1: generates the QR locally from the device's own UPI VPA and returns
   * it for the frontend to render on the display template - no hardware call yet. */
  async push(id: string, dto: TenantQrDevicePushDto) {
    const device = await this.findOne(id);
    if (device.collectionMode !== 'MANUAL') {
      throw new BadRequestException('Only MANUAL collection mode is supported until Phase 2 payment gateway integration ships');
    }
    if (!device.upiVpa) {
      throw new BadRequestException('Configure a UPI ID for this device before generating a payment QR');
    }

    const upiLink = this.buildUpiLink(device.upiVpa, device.tenantBusiness.name, dto.amount, dto.note);
    const qrDataUrl = await QRCode.toDataURL(upiLink);

    await this.prisma.tenantQrDevice.update({ where: { id }, data: { lastPushAt: now() } });
    await this.logEvent(id, 'PUSH_REQUESTED', {
      amount: dto.amount,
      message: dto.note ?? 'Payment QR requested',
      payload: JSON.stringify({ upiLink }),
    });

    return { qrDataUrl, upiLink, amount: dto.amount, note: dto.note, isTest: false, device };
  }

  /** Dry-run preview: renders exactly what push() would produce, using a nominal
   * amount, without touching lastPushAt - lets staff verify template/VPA before going live. */
  async test(id: string) {
    const device = await this.findOne(id);
    const upiLink = device.upiVpa
      ? this.buildUpiLink(device.upiVpa, device.tenantBusiness.name, TEST_AMOUNT, 'TEST')
      : `upi://pay?pa=test@example&pn=${encodeURIComponent(device.tenantBusiness.name)}&am=${TEST_AMOUNT}&cu=INR&tn=TEST`;
    const qrDataUrl = await QRCode.toDataURL(upiLink);

    await this.prisma.tenantQrDevice.update({ where: { id }, data: { lastTestAt: now() } });
    await this.logEvent(id, 'TEST_TRIGGERED', {
      amount: TEST_AMOUNT,
      message: device.upiVpa ? 'Test QR generated' : 'Test QR generated (no UPI ID configured yet - placeholder VPA used)',
      payload: JSON.stringify({ upiLink }),
    });

    return { qrDataUrl, upiLink, amount: TEST_AMOUNT, note: 'TEST', isTest: true, device };
  }

  /** The backend never talks to the physical device itself (it's USB-attached to
   * whatever machine is at the counter) - the tenant's browser does that over Web
   * Serial and reports back here so the exchange still lands in the debug log. */
  async logSerialExchange(id: string, dto: TenantQrDeviceSerialLogDto) {
    await this.findOne(id);
    await this.logEvent(id, dto.eventType, {
      message: dto.message,
      atCommand: dto.atCommand,
      atResponse: dto.atResponse,
    });
    return { success: true };
  }

  async findEvents(query: TenantQrDeviceEventListQueryDto) {
    const { page, limit, tenantQrDeviceId, tenantBusinessId, eventType, sortOrder } = query;
    const where = {
      ...(tenantQrDeviceId ? { tenantQrDeviceId } : {}),
      ...(eventType ? { eventType } : {}),
      ...(tenantBusinessId ? { device: { tenantBusinessId } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantQrDeviceEvent.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              systemCode: true,
              deviceName: true,
              tenantBusiness: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantQrDeviceEvent.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  private buildUpiLink(vpa: string, payeeName: string, amount: number, note?: string) {
    const params = new URLSearchParams({
      pa: vpa,
      pn: payeeName,
      am: amount.toFixed(2),
      cu: 'INR',
      ...(note ? { tn: note } : {}),
    });
    return `upi://pay?${params.toString()}`;
  }

  private async logEvent(
    tenantQrDeviceId: string,
    eventType: 'CREATED' | 'CONFIG_UPDATED' | 'PUSH_REQUESTED' | 'TEST_TRIGGERED' | 'PAYMENT_CONFIRMED' | 'ERROR',
    data: { amount?: number; message?: string; atCommand?: string; atResponse?: string; payload?: string },
  ) {
    await this.prisma.tenantQrDeviceEvent.create({
      data: {
        id: newId(),
        tenantQrDeviceId,
        eventType,
        amount: data.amount,
        message: data.message,
        atCommand: data.atCommand,
        atResponse: data.atResponse,
        payload: data.payload,
        createdAt: now(),
      },
    });
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) throw new BadRequestException('Tenant business does not exist or is deleted');
  }

  async listPlaces(tenantBusinessId: string) {
    return this.prisma.tenantPlace.findMany({
      where: { tenantBusinessId, status: { not: 'DELETED' } },
      select: { id: true, placeName: true },
      orderBy: { placeName: 'asc' },
    });
  }

  async listCounters(tenantBusinessId: string) {
    return this.prisma.tenantCounter.findMany({
      where: { tenantBusinessId, status: { not: 'DELETED' } },
      select: { id: true, counterName: true, counterCode: true },
      orderBy: { counterName: 'asc' },
    });
  }

  private async assertPlaceBelongsToBusiness(tenantPlaceId: string, tenantBusinessId: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id: tenantPlaceId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!place) throw new BadRequestException('Place does not exist for the given tenant business');
  }

  private async assertCounterBelongsToBusiness(tenantCounterId: string, tenantBusinessId: string) {
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id: tenantCounterId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!counter) throw new BadRequestException('Counter does not exist for the given tenant business');
  }

  private async assertTemplateUsable(displayTemplateId: string, tenantBusinessId: string) {
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: {
        id: displayTemplateId,
        status: { not: 'DELETED' },
        OR: [{ tenantBusinessId: null }, { tenantBusinessId }],
      },
    });
    if (!template) throw new BadRequestException('Display template is not available for this business');
  }

  private async assertDeviceCodeUnique(tenantBusinessId: string, deviceCode: string, excludeId?: string) {
    const existing = await this.prisma.tenantQrDevice.findFirst({
      where: {
        tenantBusinessId,
        deviceCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException(`Device code "${deviceCode}" is already used for this business`);
    }
  }

  // ---------- Tenant self-service (scoped to the caller's mapped businesses) ----------

  async listMappedBusinesses(tenantUserId: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    return this.prisma.tenantBusiness.findMany({
      where: { id: { in: businessIds }, status: { not: 'DELETED' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async listPlacesForTenantUser(tenantUserId: string, tenantBusinessId: string) {
    await this.assertBusinessOwned(tenantUserId, tenantBusinessId);
    return this.listPlaces(tenantBusinessId);
  }

  async listCountersForTenantUser(tenantUserId: string, tenantBusinessId: string) {
    await this.assertBusinessOwned(tenantUserId, tenantBusinessId);
    return this.listCounters(tenantBusinessId);
  }

  async findAllForTenantUser(tenantUserId: string, query: TenantQrDeviceListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, tenantBusinessId, tenantPlaceId, tenantCounterId, collectionMode, sortBy, sortOrder } =
      query;
    const scopedBusinessIds = tenantBusinessId
      ? businessIds.filter((bid) => bid === tenantBusinessId)
      : businessIds;
    const where = {
      tenantBusinessId: { in: scopedBusinessIds },
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(tenantCounterId ? { tenantCounterId } : {}),
      ...(collectionMode ? { collectionMode } : {}),
      ...(search
        ? {
            OR: [
              { deviceName: { contains: search } },
              { deviceCode: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantQrDevice.findMany({
        where,
        include: DEVICE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantQrDevice.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const device = await this.prisma.tenantQrDevice.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: DEVICE_INCLUDE,
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantQrDeviceDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantQrDeviceDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    if (dto.tenantBusinessId) await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.update(id, dto);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id);
  }

  async updatePaymentConfigForTenantUser(tenantUserId: string, id: string, dto: TenantQrDevicePaymentConfigDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.updatePaymentConfig(id, dto);
  }

  async pushForTenantUser(tenantUserId: string, id: string, dto: TenantQrDevicePushDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.push(id, dto);
  }

  async testForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.test(id);
  }

  async logSerialExchangeForTenantUser(tenantUserId: string, id: string, dto: TenantQrDeviceSerialLogDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.logSerialExchange(id, dto);
  }

  private async getMappedBusinessIds(tenantUserId: string): Promise<string[]> {
    const mappings = await this.prisma.tenantMappedBusiness.findMany({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    return mappings.map((m) => m.tenantBusinessId);
  }

  private async assertBusinessOwned(tenantUserId: string, tenantBusinessId: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    if (!businessIds.includes(tenantBusinessId)) {
      throw new ForbiddenException('You are not mapped to this business');
    }
  }
}
