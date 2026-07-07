import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantBusinessDto,
  UpdateTenantBusinessDto,
  UpdateTenantBusinessInfoDto,
} from './dto/tenant-business.dto';
import { TenantBusinessListQueryDto } from './dto/tenant-business-query.dto';

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class TenantBusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: TenantBusinessListQueryDto) {
    const { page, limit, search, status, country, isParentBusiness, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(country ? { country } : {}),
      ...(isParentBusiness !== undefined ? { isParentBusiness } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantBusiness.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantBusiness.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!business) throw new NotFoundException('Tenant business not found');
    return business;
  }

  async create(dto: CreateTenantBusinessDto) {
    const timestamp = now();
    return this.prisma.tenantBusiness.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('TNB'),
        ...dto,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  async update(id: string, dto: UpdateTenantBusinessDto) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!business) throw new NotFoundException('Tenant business not found');

    return this.prisma.tenantBusiness.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
    });
  }

  async remove(id: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!business) throw new NotFoundException('Tenant business not found');

    const timestamp = now();
    await this.prisma.tenantBusiness.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!business) {
      throw new NotFoundException('Tenant business not found or not deleted');
    }
    return this.prisma.tenantBusiness.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
    });
  }

  // ---------- Tenant self-service (the caller's own mapped business) ----------

  async findMine(tenantUserId: string) {
    const businessId = await this.getMyBusinessId(tenantUserId);
    return this.findOne(businessId);
  }

  async updateMine(tenantUserId: string, dto: UpdateTenantBusinessInfoDto) {
    const businessId = await this.getMyBusinessId(tenantUserId);
    return this.prisma.tenantBusiness.update({
      where: { id: businessId },
      data: { ...dto, updatedAt: now() },
    });
  }

  async updateMyLogo(tenantUserId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_LOGO_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const businessId = await this.getMyBusinessId(tenantUserId);
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: businessId, status: { not: 'DELETED' } },
    });
    if (!business) throw new NotFoundException('Tenant business not found');

    const path = await this.storage.upload(file, 'tenant-business-logos');
    if (business.logoPath) {
      await this.storage.remove(business.logoPath).catch(() => undefined);
    }
    await this.prisma.tenantBusiness.update({
      where: { id: businessId },
      data: { logoPath: path, updatedAt: now() },
    });
    return { path };
  }

  private async getMyBusinessId(tenantUserId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId, status: 'ACTIVE' },
    });
    if (!mapping) throw new NotFoundException('No business mapped to this account');
    return mapping.tenantBusinessId;
  }
}
