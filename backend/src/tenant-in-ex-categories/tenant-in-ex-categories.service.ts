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
  CreateTenantInExCategoryDto,
  UpdateTenantInExCategoryDto,
} from './dto/tenant-in-ex-category.dto';
import { TenantInExCategoryListQueryDto } from './dto/tenant-in-ex-category-query.dto';

const IN_EX_CATEGORY_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

@Injectable()
export class TenantInExCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantInExCategoryListQueryDto) {
    const { page, limit, search, status, type, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(type ? { type } : {}),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { inExCode: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantInExCategory.findMany({
        where,
        include: IN_EX_CATEGORY_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantInExCategory.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: IN_EX_CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Income/expense category not found');
    return category;
  }

  async create(dto: CreateTenantInExCategoryDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    return this.prisma.tenantInExCategory.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('INX'),
        tenantBusinessId: dto.tenantBusinessId,
        type: dto.type,
        name: dto.name,
        inExCode: dto.inExCode,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: IN_EX_CATEGORY_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantInExCategoryDto) {
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!category) throw new NotFoundException('Income/expense category not found');
    if (category.isSystem) {
      throw new BadRequestException('System categories cannot be edited');
    }
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    return this.prisma.tenantInExCategory.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: IN_EX_CATEGORY_INCLUDE,
    });
  }

  async remove(id: string) {
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!category) throw new NotFoundException('Income/expense category not found');
    if (category.isSystem) {
      throw new BadRequestException('System categories cannot be deleted');
    }

    const timestamp = now();
    await this.prisma.tenantInExCategory.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!category) {
      throw new NotFoundException('Income/expense category not found or not deleted');
    }
    return this.prisma.tenantInExCategory.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: IN_EX_CATEGORY_INCLUDE,
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

  async findAllForTenantUser(tenantUserId: string, query: TenantInExCategoryListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, type, tenantBusinessId, sortBy, sortOrder } = query;
    // System categories are global defaults, visible to every business regardless
    // of which business the caller is mapped to.
    const businessScope = tenantBusinessId
      ? { OR: [{ tenantBusinessId }, { isSystem: true }] }
      : { OR: [{ tenantBusinessId: { in: businessIds } }, { isSystem: true }] };
    const where = {
      AND: [
        businessScope,
        { status: status ? status : ({ not: 'DELETED' } as const) },
        ...(type ? [{ type }] : []),
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search } },
                  { inExCode: { contains: search } },
                  { systemCode: { contains: search } },
                ],
              },
            ]
          : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantInExCategory.findMany({
        where,
        include: IN_EX_CATEGORY_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantInExCategory.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: {
        id,
        OR: [{ tenantBusinessId: { in: businessIds } }, { isSystem: true }],
        status: { not: 'DELETED' },
      },
      include: IN_EX_CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Income/expense category not found');
    return category;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantInExCategoryDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantInExCategoryDto,
  ) {
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
