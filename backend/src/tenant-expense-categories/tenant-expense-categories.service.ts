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
  CreateTenantExpenseCategoryDto,
  UpdateTenantExpenseCategoryDto,
} from './dto/tenant-expense-category.dto';
import { TenantExpenseCategoryListQueryDto } from './dto/tenant-expense-category-query.dto';

const EXPENSE_CATEGORY_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

@Injectable()
export class TenantExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantExpenseCategoryListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { expenseCategorieName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantExpenseCategory.findMany({
        where,
        include: EXPENSE_CATEGORY_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantExpenseCategory.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const category = await this.prisma.tenantExpenseCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: EXPENSE_CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  async create(dto: CreateTenantExpenseCategoryDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    return this.prisma.tenantExpenseCategory.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('EXP'),
        tenantBusinessId: dto.tenantBusinessId,
        expenseCategorieName: dto.expenseCategorieName,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: EXPENSE_CATEGORY_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantExpenseCategoryDto) {
    const category = await this.prisma.tenantExpenseCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    if (category.isSystem) {
      throw new BadRequestException('System expense categories cannot be edited');
    }
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    return this.prisma.tenantExpenseCategory.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: EXPENSE_CATEGORY_INCLUDE,
    });
  }

  async remove(id: string) {
    const category = await this.prisma.tenantExpenseCategory.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    if (category.isSystem) {
      throw new BadRequestException('System expense categories cannot be deleted');
    }

    const timestamp = now();
    await this.prisma.tenantExpenseCategory.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const category = await this.prisma.tenantExpenseCategory.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!category) {
      throw new NotFoundException('Expense category not found or not deleted');
    }
    return this.prisma.tenantExpenseCategory.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: EXPENSE_CATEGORY_INCLUDE,
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

  async findAllForTenantUser(tenantUserId: string, query: TenantExpenseCategoryListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    // System expense categories are global defaults, visible to every business regardless
    // of which business the caller is mapped to.
    const businessScope = tenantBusinessId
      ? { OR: [{ tenantBusinessId }, { isSystem: true }] }
      : { OR: [{ tenantBusinessId: { in: businessIds } }, { isSystem: true }] };
    const where = {
      AND: [
        businessScope,
        { status: status ? status : ({ not: 'DELETED' } as const) },
        ...(search
          ? [
              {
                OR: [
                  { expenseCategorieName: { contains: search } },
                  { systemCode: { contains: search } },
                ],
              },
            ]
          : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantExpenseCategory.findMany({
        where,
        include: EXPENSE_CATEGORY_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantExpenseCategory.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const category = await this.prisma.tenantExpenseCategory.findFirst({
      where: {
        id,
        OR: [{ tenantBusinessId: { in: businessIds } }, { isSystem: true }],
        status: { not: 'DELETED' },
      },
      include: EXPENSE_CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantExpenseCategoryDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantExpenseCategoryDto,
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
