import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantTaxTypeDto, UpdateTenantTaxTypeDto } from './dto/tenant-tax-type.dto';
import { TenantTaxTypeListQueryDto } from './dto/tenant-tax-type-query.dto';

const TAX_TYPE_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

@Injectable()
export class TenantTaxTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantTaxTypeListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { taxName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantTaxType.findMany({
        where,
        include: TAX_TYPE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantTaxType.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const taxType = await this.prisma.tenantTaxType.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: TAX_TYPE_INCLUDE,
    });
    if (!taxType) throw new NotFoundException('Tax type not found');
    return taxType;
  }

  async create(dto: CreateTenantTaxTypeDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    return this.prisma.tenantTaxType.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('TAX'),
        tenantBusinessId: dto.tenantBusinessId,
        taxName: dto.taxName,
        calculationType: dto.calculationType,
        value: dto.value,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: TAX_TYPE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantTaxTypeDto) {
    const taxType = await this.prisma.tenantTaxType.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!taxType) throw new NotFoundException('Tax type not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    return this.prisma.tenantTaxType.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: TAX_TYPE_INCLUDE,
    });
  }

  async remove(id: string) {
    const taxType = await this.prisma.tenantTaxType.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!taxType) throw new NotFoundException('Tax type not found');

    const timestamp = now();
    await this.prisma.tenantTaxType.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const taxType = await this.prisma.tenantTaxType.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!taxType) {
      throw new NotFoundException('Tax type not found or not deleted');
    }
    return this.prisma.tenantTaxType.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: TAX_TYPE_INCLUDE,
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

  // ---------- Tenant self-service (scoped to the caller's mapped businesses) ----------

  async listMappedBusinesses(tenantUserId: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    return this.prisma.tenantBusiness.findMany({
      where: { id: { in: businessIds }, status: { not: 'DELETED' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAllForTenantUser(tenantUserId: string, query: TenantTaxTypeListQueryDto) {
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
              { taxName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantTaxType.findMany({
        where,
        include: TAX_TYPE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantTaxType.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const taxType = await this.prisma.tenantTaxType.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: TAX_TYPE_INCLUDE,
    });
    if (!taxType) throw new NotFoundException('Tax type not found');
    return taxType;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantTaxTypeDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantTaxTypeDto) {
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
