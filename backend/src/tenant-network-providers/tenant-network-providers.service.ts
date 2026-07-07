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
  CreateTenantNetworkProviderDto,
  UpdateTenantNetworkProviderDto,
} from './dto/tenant-network-provider.dto';
import { TenantNetworkProviderListQueryDto } from './dto/tenant-network-provider-query.dto';

const NETWORK_PROVIDER_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

@Injectable()
export class TenantNetworkProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantNetworkProviderListQueryDto) {
    const { page, limit, search, status, type, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(type ? { type } : {}),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { systemCode: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantNetworkProvider.findMany({
        where,
        include: NETWORK_PROVIDER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantNetworkProvider.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const provider = await this.prisma.tenantNetworkProvider.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: NETWORK_PROVIDER_INCLUDE,
    });
    if (!provider) throw new NotFoundException('Network provider not found');
    return provider;
  }

  async create(dto: CreateTenantNetworkProviderDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    return this.prisma.tenantNetworkProvider.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('NWP'),
        tenantBusinessId: dto.tenantBusinessId,
        type: dto.type,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: NETWORK_PROVIDER_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantNetworkProviderDto) {
    const provider = await this.prisma.tenantNetworkProvider.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!provider) throw new NotFoundException('Network provider not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    return this.prisma.tenantNetworkProvider.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: NETWORK_PROVIDER_INCLUDE,
    });
  }

  async remove(id: string) {
    const provider = await this.prisma.tenantNetworkProvider.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!provider) throw new NotFoundException('Network provider not found');

    const timestamp = now();
    await this.prisma.tenantNetworkProvider.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const provider = await this.prisma.tenantNetworkProvider.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!provider) {
      throw new NotFoundException('Network provider not found or not deleted');
    }
    return this.prisma.tenantNetworkProvider.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: NETWORK_PROVIDER_INCLUDE,
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

  async findAllForTenantUser(tenantUserId: string, query: TenantNetworkProviderListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, type, tenantBusinessId, sortBy, sortOrder } = query;
    const scopedBusinessIds = tenantBusinessId
      ? businessIds.filter((id) => id === tenantBusinessId)
      : businessIds;
    const where = {
      tenantBusinessId: { in: scopedBusinessIds },
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { systemCode: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantNetworkProvider.findMany({
        where,
        include: NETWORK_PROVIDER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantNetworkProvider.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const provider = await this.prisma.tenantNetworkProvider.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: NETWORK_PROVIDER_INCLUDE,
    });
    if (!provider) throw new NotFoundException('Network provider not found');
    return provider;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantNetworkProviderDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.create(dto);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantNetworkProviderDto,
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
