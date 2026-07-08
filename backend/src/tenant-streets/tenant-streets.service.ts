import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantStreetDto, UpdateTenantStreetDto } from './dto/tenant-street.dto';
import { TenantStreetListQueryDto } from './dto/tenant-street-query.dto';

const STREET_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
  tenantPlace: { select: { id: true, systemCode: true, placeName: true } },
};

function serializeStreet<T extends { latitude: unknown; longitude: unknown }>(
  street: T,
): Omit<T, 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null } {
  return {
    ...street,
    latitude: street.latitude == null ? null : Number(street.latitude),
    longitude: street.longitude == null ? null : Number(street.longitude),
  };
}

@Injectable()
export class TenantStreetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantStreetListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, tenantPlaceId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(search
        ? {
            OR: [
              { streetName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantStreet.findMany({
        where,
        include: STREET_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantStreet.count({ where }),
    ]);
    return listResponse(items.map(serializeStreet), total, page, limit);
  }

  async findOne(id: string) {
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: STREET_INCLUDE,
    });
    if (!street) throw new NotFoundException('Street not found');
    return serializeStreet(street);
  }

  async create(dto: CreateTenantStreetDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    await this.assertPlaceBelongsToBusiness(dto.tenantPlaceId, dto.tenantBusinessId);

    const timestamp = now();
    const street = await this.prisma.tenantStreet.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('STR'),
        tenantBusinessId: dto.tenantBusinessId,
        tenantPlaceId: dto.tenantPlaceId,
        streetName: dto.streetName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        remark: dto.remark,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: STREET_INCLUDE,
    });
    return serializeStreet(street);
  }

  async update(id: string, dto: UpdateTenantStreetDto) {
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!street) throw new NotFoundException('Street not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId || dto.tenantBusinessId) {
      await this.assertPlaceBelongsToBusiness(
        dto.tenantPlaceId ?? street.tenantPlaceId,
        dto.tenantBusinessId ?? street.tenantBusinessId,
      );
    }

    const updated = await this.prisma.tenantStreet.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: STREET_INCLUDE,
    });
    return serializeStreet(updated);
  }

  async remove(id: string) {
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!street) throw new NotFoundException('Street not found');

    const timestamp = now();
    await this.prisma.tenantStreet.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!street) {
      throw new NotFoundException('Street not found or not deleted');
    }
    const restored = await this.prisma.tenantStreet.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: STREET_INCLUDE,
    });
    return serializeStreet(restored);
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

  private async assertPlaceBelongsToBusiness(tenantPlaceId: string, tenantBusinessId: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id: tenantPlaceId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!place) {
      throw new BadRequestException('Place does not exist for the given tenant business');
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

  async findAllForTenantUser(tenantUserId: string, query: TenantStreetListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, tenantBusinessId, tenantPlaceId, sortBy, sortOrder } = query;
    const scopedBusinessIds = tenantBusinessId
      ? businessIds.filter((id) => id === tenantBusinessId)
      : businessIds;
    const where = {
      tenantBusinessId: { in: scopedBusinessIds },
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(search
        ? {
            OR: [
              { streetName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantStreet.findMany({
        where,
        include: STREET_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantStreet.count({ where }),
    ]);
    return listResponse(items.map(serializeStreet), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const street = await this.prisma.tenantStreet.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: STREET_INCLUDE,
    });
    if (!street) throw new NotFoundException('Street not found');
    return serializeStreet(street);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantStreetDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantStreetDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    if (dto.tenantBusinessId) await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.update(id, dto);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id);
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
