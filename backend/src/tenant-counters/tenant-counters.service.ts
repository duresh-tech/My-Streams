import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantCounterDto, UpdateTenantCounterDto } from './dto/tenant-counter.dto';
import { TenantCounterListQueryDto } from './dto/tenant-counter-query.dto';

const COUNTER_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
  tenantPlace: { select: { id: true, systemCode: true, placeName: true } },
};

@Injectable()
export class TenantCountersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantCounterListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, tenantPlaceId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(tenantPlaceId ? { tenantPlaceId } : {}),
      ...(search
        ? {
            OR: [
              { counterName: { contains: search } },
              { counterCode: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCounter.findMany({
        where,
        include: COUNTER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCounter.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: COUNTER_INCLUDE,
    });
    if (!counter) throw new NotFoundException('Counter not found');
    return counter;
  }

  async create(dto: CreateTenantCounterDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId) await this.assertPlaceBelongsToBusiness(dto.tenantPlaceId, dto.tenantBusinessId);
    await this.assertCounterCodeUnique(dto.tenantBusinessId, dto.counterCode);

    const timestamp = now();
    return this.prisma.tenantCounter.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('CTR'),
        tenantBusinessId: dto.tenantBusinessId,
        tenantPlaceId: dto.tenantPlaceId,
        counterCode: dto.counterCode,
        counterName: dto.counterName,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: COUNTER_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantCounterDto) {
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!counter) throw new NotFoundException('Counter not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.tenantPlaceId) {
      await this.assertPlaceBelongsToBusiness(
        dto.tenantPlaceId,
        dto.tenantBusinessId ?? counter.tenantBusinessId,
      );
    }
    if (dto.counterCode || dto.tenantBusinessId) {
      await this.assertCounterCodeUnique(
        dto.tenantBusinessId ?? counter.tenantBusinessId,
        dto.counterCode ?? counter.counterCode,
        id,
      );
    }

    return this.prisma.tenantCounter.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: COUNTER_INCLUDE,
    });
  }

  async remove(id: string) {
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!counter) throw new NotFoundException('Counter not found');

    const timestamp = now();
    await this.prisma.tenantCounter.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!counter) {
      throw new NotFoundException('Counter not found or not deleted');
    }
    return this.prisma.tenantCounter.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: COUNTER_INCLUDE,
    });
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
    return this.prisma.tenantPlace.findMany({
      where: { tenantBusinessId, status: { not: 'DELETED' } },
      select: { id: true, placeName: true },
      orderBy: { placeName: 'asc' },
    });
  }

  private async assertPlaceBelongsToBusiness(tenantPlaceId: string, tenantBusinessId: string) {
    const place = await this.prisma.tenantPlace.findFirst({
      where: { id: tenantPlaceId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!place) {
      throw new BadRequestException('Place does not exist for the given tenant business');
    }
  }

  private async assertCounterCodeUnique(tenantBusinessId: string, counterCode: string, excludeId?: string) {
    // Not scoped to status=DELETED: the (tenantBusinessId, counterCode) unique
    // constraint applies to every row regardless of soft-delete state, so a
    // code held by a deleted-but-restorable counter can't be reissued either.
    const existing = await this.prisma.tenantCounter.findFirst({
      where: {
        tenantBusinessId,
        counterCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException(`Counter code "${counterCode}" is already used for this business`);
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

  async findAllForTenantUser(tenantUserId: string, query: TenantCounterListQueryDto) {
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
              { counterName: { contains: search } },
              { counterCode: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCounter.findMany({
        where,
        include: COUNTER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCounter.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const counter = await this.prisma.tenantCounter.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: COUNTER_INCLUDE,
    });
    if (!counter) throw new NotFoundException('Counter not found');
    return counter;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantCounterDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantCounterDto) {
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
