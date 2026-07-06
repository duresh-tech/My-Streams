import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateTenantBusinessDto, UpdateTenantBusinessDto } from './dto/tenant-business.dto';
import { TenantBusinessListQueryDto } from './dto/tenant-business-query.dto';

@Injectable()
export class TenantBusinessService {
  constructor(private readonly prisma: PrismaService) {}

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
}
