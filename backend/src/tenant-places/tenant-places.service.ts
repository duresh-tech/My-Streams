import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantPlaceDto, UpdateTenantPlaceDto } from './dto/tenant-place.dto';
import { TenantPlaceListQueryDto } from './dto/tenant-place-query.dto';

const PLACE_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

function serializePlace<T extends { latitude: unknown; longitude: unknown }>(
  place: T,
): Omit<T, 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null } {
  return {
    ...place,
    latitude: place.latitude == null ? null : Number(place.latitude),
    longitude: place.longitude == null ? null : Number(place.longitude),
  };
}

@Injectable()
export class TenantPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantPlaceListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { placeName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantPlace.findMany({
        where,
        include: PLACE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantPlace.count({ where }),
    ]);
    return listResponse(items.map(serializePlace), total, page, limit);
  }

  async findOne(id: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: PLACE_INCLUDE,
    });
    if (!place) throw new NotFoundException('Place not found');
    return serializePlace(place);
  }

  async create(dto: CreateTenantPlaceDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    const place = await this.prisma.tenantPlace.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('PLC'),
        tenantBusinessId: dto.tenantBusinessId,
        placeName: dto.placeName,
        remark: dto.remark,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: PLACE_INCLUDE,
    });
    return serializePlace(place);
  }

  async update(id: string, dto: UpdateTenantPlaceDto) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!place) throw new NotFoundException('Place not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    const updated = await this.prisma.tenantPlace.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: PLACE_INCLUDE,
    });
    return serializePlace(updated);
  }

  async remove(id: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!place) throw new NotFoundException('Place not found');

    const timestamp = now();
    await this.prisma.tenantPlace.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!place) {
      throw new NotFoundException('Place not found or not deleted');
    }
    const restored = await this.prisma.tenantPlace.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: PLACE_INCLUDE,
    });
    return serializePlace(restored);
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
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

  async findAllForTenantUser(tenantUserId: string, query: TenantPlaceListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const scopedBusinessIds = tenantBusinessId
      ? businessIds.filter((id) => id === tenantBusinessId)
      : businessIds;
    const where = {
      tenantBusinessId: { in: scopedBusinessIds },
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(search
        ? {
            OR: [
              { placeName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantPlace.findMany({
        where,
        include: PLACE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantPlace.count({ where }),
    ]);
    return listResponse(items.map(serializePlace), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: PLACE_INCLUDE,
    });
    if (!place) throw new NotFoundException('Place not found');
    return serializePlace(place);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantPlaceDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantPlaceDto) {
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
