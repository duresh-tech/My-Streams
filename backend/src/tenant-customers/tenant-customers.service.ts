import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantCustomerDto,
  UpdateTenantCustomerDto,
} from './dto/tenant-customer.dto';
import { TenantCustomerListQueryDto } from './dto/tenant-customer-query.dto';
import { ImportTenantCustomerRowSchema } from './dto/import-tenant-customer-row.dto';

const TENANT_CUSTOMER_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
  tenantPlace: { select: { id: true, systemCode: true, placeName: true } },
  tenantStreet: { select: { id: true, systemCode: true, streetName: true } },
};

const CSV_COLUMNS = [
  'systemCode',
  'tenantBusinessId',
  'customerCode',
  'fName',
  'lName',
  'fatherName',
  'gender',
  'dateOfBirth',
  'primaryMobile',
  'secondaryMobile',
  'email',
  'customerType',
  'tenantPlaceId',
  'tenantStreetId',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'country',
  'pincode',
  'latitude',
  'longitude',
  'idProofType',
  'idProofNumber',
  'taxType',
  'taxNumber',
  'notifyViaSMS',
  'notifyViaWhatsApp',
  'notifyViaRCS',
  'allowPortalAccess',
  'remark',
  'status',
] as const;

function serializeCustomer<
  T extends { latitude: unknown; longitude: unknown; dateOfBirth: unknown },
>(
  customer: T,
): Omit<T, 'latitude' | 'longitude' | 'dateOfBirth'> & {
  latitude: number | null;
  longitude: number | null;
  dateOfBirth: string | null;
} {
  return {
    ...customer,
    latitude: customer.latitude == null ? null : Number(customer.latitude),
    longitude: customer.longitude == null ? null : Number(customer.longitude),
    dateOfBirth:
      customer.dateOfBirth == null
        ? null
        : (customer.dateOfBirth as Date).toISOString().slice(0, 10),
  };
}

@Injectable()
export class TenantCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(
    query: TenantCustomerListQueryDto,
    extra: { tenantBusinessId?: { in: string[] } } = {},
  ) {
    const { search, status, tenantBusinessId, tenantPlaceId, tenantStreetId } = query;
    return {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(extra.tenantBusinessId
        ? { tenantBusinessId: extra.tenantBusinessId }
        : tenantBusinessId
          ? { tenantBusinessId }
          : {}),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(tenantStreetId ? { tenantStreetId } : {}),
      ...(search
        ? {
            OR: [
              { fName: { contains: search } },
              { lName: { contains: search } },
              { customerCode: { contains: search } },
              { primaryMobile: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
  }

  async findAll(query: TenantCustomerListQueryDto) {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCustomer.findMany({
        where,
        include: TENANT_CUSTOMER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCustomer.count({ where }),
    ]);
    return listResponse(items.map(serializeCustomer), total, page, limit);
  }

  async findDeleted(query: TenantCustomerListQueryDto) {
    const { page, limit, sortBy, sortOrder } = query;
    const where = { ...this.buildWhere({ ...query, status: undefined }), status: 'DELETED' as const };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCustomer.findMany({
        where,
        include: TENANT_CUSTOMER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCustomer.count({ where }),
    ]);
    return listResponse(items.map(serializeCustomer), total, page, limit);
  }

  async findOne(id: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return serializeCustomer(customer);
  }

  async create(dto: CreateTenantCustomerDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId) await this.assertPlaceBelongsToBusiness(dto.tenantPlaceId, dto.tenantBusinessId);
    if (dto.tenantStreetId) {
      if (!dto.tenantPlaceId) {
        throw new BadRequestException('tenantPlaceId is required when tenantStreetId is given');
      }
      await this.assertStreetBelongsToPlace(dto.tenantStreetId, dto.tenantPlaceId);
    }
    await this.assertCustomerCodeUnique(dto.tenantBusinessId, dto.customerCode);

    const timestamp = now();
    const customer = await this.prisma.tenantCustomer.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('TNC'),
        ...dto,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    return serializeCustomer(customer);
  }

  async update(id: string, dto: UpdateTenantCustomerDto) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const tenantBusinessId = dto.tenantBusinessId ?? customer.tenantBusinessId;
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    const tenantPlaceId = dto.tenantPlaceId !== undefined ? dto.tenantPlaceId : customer.tenantPlaceId;
    if (dto.tenantPlaceId || dto.tenantBusinessId) {
      if (tenantPlaceId) await this.assertPlaceBelongsToBusiness(tenantPlaceId, tenantBusinessId);
    }

    const tenantStreetId = dto.tenantStreetId !== undefined ? dto.tenantStreetId : customer.tenantStreetId;
    if (tenantStreetId) {
      if (!tenantPlaceId) {
        throw new BadRequestException('tenantPlaceId is required when tenantStreetId is given');
      }
      if (dto.tenantStreetId || dto.tenantPlaceId) {
        await this.assertStreetBelongsToPlace(tenantStreetId, tenantPlaceId);
      }
    }

    if (dto.customerCode || dto.tenantBusinessId) {
      await this.assertCustomerCodeUnique(
        tenantBusinessId,
        dto.customerCode ?? customer.customerCode,
        id,
      );
    }

    const updated = await this.prisma.tenantCustomer.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    return serializeCustomer(updated);
  }

  async changeStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.tenantCustomer.update({
      where: { id },
      data: { status, updatedAt: now() },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    return serializeCustomer(updated);
  }

  async remove(id: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const timestamp = now();
    await this.prisma.tenantCustomer.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found or not deleted');
    }
    const restored = await this.prisma.tenantCustomer.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    return serializeCustomer(restored);
  }

  async exportRows(query: TenantCustomerListQueryDto) {
    const where = this.buildWhere(query);
    const items = await this.prisma.tenantCustomer.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
    });
    return this.toCsvRows(items.map(serializeCustomer));
  }

  private toCsvRows(items: ReturnType<typeof serializeCustomer>[]) {
    return items.map((item) => {
      const row: Record<string, string> = {};
      for (const col of CSV_COLUMNS) {
        const value = (item as unknown as Record<string, unknown>)[col];
        row[col] = value === null || value === undefined ? '' : String(value);
      }
      return row;
    });
  }

  get csvColumns(): readonly string[] {
    return CSV_COLUMNS;
  }

  async importRows(
    rawRows: Record<string, unknown>[],
    resolveBusinessId: (parsedBusinessId?: string) => Promise<string>,
  ) {
    let created = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rawRows.length; i += 1) {
      const rowNumber = i + 2; // account for the header row, 1-indexed
      const parsed = ImportTenantCustomerRowSchema.safeParse(rawRows[i]);
      if (!parsed.success) {
        skipped += 1;
        errors.push({ row: rowNumber, error: parsed.error.issues.map((iss) => iss.message).join('; ') });
        continue;
      }
      try {
        const tenantBusinessId = await resolveBusinessId(parsed.data.tenantBusinessId);
        await this.create({ ...parsed.data, tenantBusinessId });
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push({ row: rowNumber, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return { created, skipped, errors };
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
    }
  }

  async listPlaces(tenantBusinessId: string) {
    const places = await this.prisma.tenantPlace.findMany({
      where: { tenantBusinessId, status: { not: 'DELETED' } },
      select: { id: true, placeName: true, latitude: true, longitude: true, radiusMeters: true },
      orderBy: { placeName: 'asc' },
    });
    return places.map((place) => ({
      ...place,
      latitude: place.latitude == null ? null : Number(place.latitude),
      longitude: place.longitude == null ? null : Number(place.longitude),
    }));
  }

  async listStreets(tenantBusinessId: string, tenantPlaceId: string) {
    const streets = await this.prisma.tenantStreet.findMany({
      where: { tenantBusinessId, tenantPlaceId, status: { not: 'DELETED' } },
      select: { id: true, streetName: true, latitude: true, longitude: true },
      orderBy: { streetName: 'asc' },
    });
    return streets.map((street) => ({
      ...street,
      latitude: street.latitude == null ? null : Number(street.latitude),
      longitude: street.longitude == null ? null : Number(street.longitude),
    }));
  }

  private async assertPlaceBelongsToBusiness(tenantPlaceId: string, tenantBusinessId: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id: tenantPlaceId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!place) {
      throw new BadRequestException('Place does not exist for the given tenant business');
    }
  }

  private async assertStreetBelongsToPlace(tenantStreetId: string, tenantPlaceId: string) {
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id: tenantStreetId, tenantPlaceId, status: { not: 'DELETED' } },
    });
    if (!street) {
      throw new BadRequestException('Street does not exist for the given place');
    }
  }

  private async assertCustomerCodeUnique(tenantBusinessId: string, customerCode: string, excludeId?: string) {
    const existing = await this.prisma.tenantCustomer.findFirst({
      where: {
        tenantBusinessId,
        customerCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException(`Customer code "${customerCode}" is already used for this business`);
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

  async listStreetsForTenantUser(tenantUserId: string, tenantBusinessId: string, tenantPlaceId: string) {
    await this.assertBusinessOwned(tenantUserId, tenantBusinessId);
    return this.listStreets(tenantBusinessId, tenantPlaceId);
  }

  async findAllForTenantUser(tenantUserId: string, query: TenantCustomerListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const scopedBusinessIds = query.tenantBusinessId
      ? businessIds.filter((id) => id === query.tenantBusinessId)
      : businessIds;
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(
      { ...query, tenantBusinessId: undefined },
      { tenantBusinessId: { in: scopedBusinessIds } },
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCustomer.findMany({
        where,
        include: TENANT_CUSTOMER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCustomer.count({ where }),
    ]);
    return listResponse(items.map(serializeCustomer), total, page, limit);
  }

  async findDeletedForTenantUser(tenantUserId: string, query: TenantCustomerListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const scopedBusinessIds = query.tenantBusinessId
      ? businessIds.filter((id) => id === query.tenantBusinessId)
      : businessIds;
    const { page, limit, sortBy, sortOrder } = query;
    const where = {
      ...this.buildWhere(
        { ...query, tenantBusinessId: undefined, status: undefined },
        { tenantBusinessId: { in: scopedBusinessIds } },
      ),
      status: 'DELETED' as const,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCustomer.findMany({
        where,
        include: TENANT_CUSTOMER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCustomer.count({ where }),
    ]);
    return listResponse(items.map(serializeCustomer), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: TENANT_CUSTOMER_INCLUDE,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return serializeCustomer(customer);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantCustomerDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantCustomerDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    if (dto.tenantBusinessId) await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.update(id, dto);
  }

  async changeStatusForTenantUser(tenantUserId: string, id: string, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.changeStatus(id, status);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id);
  }

  async restoreForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: 'DELETED' },
    });
    if (!customer) throw new NotFoundException('Customer not found or not deleted');
    return this.restore(id);
  }

  async exportRowsForTenantUser(tenantUserId: string, query: TenantCustomerListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const scopedBusinessIds = query.tenantBusinessId
      ? businessIds.filter((id) => id === query.tenantBusinessId)
      : businessIds;
    const where = this.buildWhere(
      { ...query, tenantBusinessId: undefined },
      { tenantBusinessId: { in: scopedBusinessIds } },
    );
    const items = await this.prisma.tenantCustomer.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
    });
    return this.toCsvRows(items.map(serializeCustomer));
  }

  async importRowsForTenantUser(tenantUserId: string, rawRows: Record<string, unknown>[]) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    return this.importRows(rawRows, async (parsedBusinessId) => {
      if (parsedBusinessId) {
        if (!businessIds.includes(parsedBusinessId)) {
          throw new ForbiddenException('You are not mapped to this business');
        }
        return parsedBusinessId;
      }
      if (businessIds.length !== 1) {
        throw new BadRequestException(
          'tenantBusinessId column is required when you are mapped to more than one business',
        );
      }
      return businessIds[0];
    });
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
