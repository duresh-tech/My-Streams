import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantSubscriptionPlanDto,
  CreateTenantSubscriptionPlanSelfDto,
  UpdateTenantSubscriptionPlanDto,
  UpdateTenantSubscriptionPlanSelfDto,
} from './dto/tenant-subscription-plan.dto';
import { TenantSubscriptionPlanListQueryDto } from './dto/tenant-subscription-plan-query.dto';

const PLAN_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
} satisfies Prisma.TenantSubscriptionPlanInclude;

type PlanRow = Prisma.TenantSubscriptionPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/**
 * Prices are Decimal in the database so money never picks up binary rounding
 * error. Prisma hands them back as Decimal objects, which JSON-encode as
 * strings, so they are converted to numbers on the way out - the same treatment
 * latitude/longitude get in tenant-customers.
 */
function serializePlan(plan: PlanRow) {
  return {
    ...plan,
    orginalPrice: Number(plan.orginalPrice),
    customerPrice: Number(plan.customerPrice),
    resellerPrice: Number(plan.resellerPrice),
    features: (plan.features as string[] | null) ?? [],
    playbackProtocols: (plan.playbackProtocols as string[] | null) ?? [],
  };
}

@Injectable()
export class TenantSubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantSubscriptionPlanListQueryDto) {
    return this.list(query, null);
  }

  async findOne(id: string) {
    const plan = await this.prisma.tenantSubscriptionPlan.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return serializePlan(plan);
  }

  async create(dto: CreateTenantSubscriptionPlanDto, actorId?: string) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    await this.assertNameUnique(dto.tenantBusinessId, dto.name);

    const timestamp = now();
    const plan = await this.prisma.tenantSubscriptionPlan.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('SUB'),
        ...dto,
        // Same reason as update(): a JSON column takes DbNull, not null.
        features: dto.features ?? Prisma.DbNull,
        playbackProtocols: dto.playbackProtocols ?? Prisma.DbNull,
        description: dto.description ?? null,
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
      include: PLAN_INCLUDE,
    });
    return serializePlan(plan);
  }

  async update(id: string, dto: UpdateTenantSubscriptionPlanDto, actorId?: string) {
    const plan = await this.prisma.tenantSubscriptionPlan.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    // The plan's type cannot change, so the limits are validated against the
    // type already stored rather than one supplied in the request.
    if (plan.subscriptionFor === 'STREAM' && dto.maxServerStream != null) {
      throw new BadRequestException('maxServerStream applies to SERVER plans only');
    }
    if (plan.subscriptionFor === 'SERVER' && dto.maxStreams != null) {
      throw new BadRequestException('maxStreams applies to STREAM plans only');
    }

    const tenantBusinessId = dto.tenantBusinessId ?? plan.tenantBusinessId;
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.name || dto.tenantBusinessId) {
      await this.assertNameUnique(tenantBusinessId, dto.name ?? plan.name, id);
    }

    // features/playbackProtocols are pulled out so the raw `null` the DTO
    // allows never reaches Prisma, which wants DbNull for a JSON column.
    const {
      tenantBusinessId: movedTo,
      features,
      playbackProtocols,
      ...fields
    } = dto;
    // Named explicitly: a conditional spread of the foreign key leaves TS
    // unable to choose between Prisma's checked and unchecked update inputs.
    const data: Prisma.TenantSubscriptionPlanUncheckedUpdateInput = {
      ...fields,
      ...(movedTo ? { tenantBusinessId: movedTo } : {}),
      // Prisma distinguishes a JSON null from "leave alone"; undefined is the
      // one that means leave alone, DbNull actually writes null.
      ...(features !== undefined ? { features: features ?? Prisma.DbNull } : {}),
      ...(playbackProtocols !== undefined
        ? { playbackProtocols: playbackProtocols ?? Prisma.DbNull }
        : {}),
      updatedAt: now(),
      updatedBy: actorId,
    };

    const updated = await this.prisma.tenantSubscriptionPlan.update({
      where: { id },
      data,
      include: PLAN_INCLUDE,
    });
    return serializePlan(updated);
  }

  async remove(id: string, actorId?: string) {
    const plan = await this.prisma.tenantSubscriptionPlan.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const timestamp = now();
    await this.prisma.tenantSubscriptionPlan.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: timestamp,
        deletedBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    return { success: true };
  }

  /** Shared list query. `businessScope` is null for system callers. */
  private async list(query: TenantSubscriptionPlanListQueryDto, businessScope: string | null) {
    const {
      page,
      limit,
      search,
      status,
      subscriptionFor,
      tenantBusinessId,
      showCustomer,
      showReseller,
      sortBy,
      sortOrder,
    } = query;

    const where: Prisma.TenantSubscriptionPlanWhereInput = {
      status: status ? status : { not: 'DELETED' },
      ...(businessScope ? { tenantBusinessId: businessScope } : {}),
      ...(tenantBusinessId && !businessScope ? { tenantBusinessId } : {}),
      ...(subscriptionFor ? { subscriptionFor } : {}),
      ...(showCustomer !== undefined ? { showCustomer } : {}),
      ...(showReseller !== undefined ? { showReseller } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantSubscriptionPlan.findMany({
        where,
        include: PLAN_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantSubscriptionPlan.count({ where }),
    ]);
    return listResponse(items.map(serializePlan), total, page, limit);
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
    }
  }

  private async assertNameUnique(tenantBusinessId: string, name: string, excludeId?: string) {
    const existing = await this.prisma.tenantSubscriptionPlan.findFirst({
      where: { tenantBusinessId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new BadRequestException(`Plan "${name}" already exists for this business`);
    }
  }

  // ---------- Tenant self-service (scoped to the caller's business) ----------

  async findAllForTenantUser(tenantUserId: string, query: TenantSubscriptionPlanListQueryDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.list(query, tenantBusinessId);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    const plan = await this.prisma.tenantSubscriptionPlan.findFirst({
      where: { id, tenantBusinessId, status: { not: 'DELETED' } },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return serializePlan(plan);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantSubscriptionPlanSelfDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.create({ ...dto, tenantBusinessId }, tenantUserId);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantSubscriptionPlanSelfDto,
  ) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.update(id, dto, tenantUserId);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id, tenantUserId);
  }

  private async getMappedBusinessId(tenantUserId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    if (!mapping) {
      throw new ForbiddenException('Your account is not mapped to a business');
    }
    return mapping.tenantBusinessId;
  }
}
