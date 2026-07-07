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
  CreateTenantPaymentModeDto,
  UpdateTenantPaymentModeDto,
} from './dto/tenant-payment-mode.dto';
import { TenantPaymentModeListQueryDto } from './dto/tenant-payment-mode-query.dto';

const PAYMENT_MODE_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

@Injectable()
export class TenantPaymentModesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantPaymentModeListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { paymentName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantPaymentMode.findMany({
        where,
        include: PAYMENT_MODE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantPaymentMode.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: PAYMENT_MODE_INCLUDE,
    });
    if (!mode) throw new NotFoundException('Payment mode not found');
    return mode;
  }

  async create(dto: CreateTenantPaymentModeDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    return this.prisma.tenantPaymentMode.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('PAY'),
        tenantBusinessId: dto.tenantBusinessId,
        paymentName: dto.paymentName,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: PAYMENT_MODE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantPaymentModeDto) {
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!mode) throw new NotFoundException('Payment mode not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    return this.prisma.tenantPaymentMode.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: PAYMENT_MODE_INCLUDE,
    });
  }

  async remove(id: string) {
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!mode) throw new NotFoundException('Payment mode not found');
    if (mode.isSystem) {
      throw new BadRequestException('System payment modes cannot be deleted');
    }

    const timestamp = now();
    await this.prisma.tenantPaymentMode.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!mode) {
      throw new NotFoundException('Payment mode not found or not deleted');
    }
    return this.prisma.tenantPaymentMode.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: PAYMENT_MODE_INCLUDE,
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

  async findAllForTenantUser(tenantUserId: string, query: TenantPaymentModeListQueryDto) {
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
              { paymentName: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantPaymentMode.findMany({
        where,
        include: PAYMENT_MODE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantPaymentMode.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: PAYMENT_MODE_INCLUDE,
    });
    if (!mode) throw new NotFoundException('Payment mode not found');
    return mode;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantPaymentModeDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantPaymentModeDto) {
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
