import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  ChangeMappedBusinessStatusDto,
  CreateMappedBusinessDto,
  UpdateMappedBusinessDto,
} from './dto/tenant-mapped-business.dto';
import { TenantMappedBusinessListQueryDto } from './dto/tenant-mapped-business-query.dto';

const MAPPING_INCLUDE = {
  tenantUser: {
    select: { id: true, systemCode: true, fName: true, username: true, email: true, status: true },
  },
  tenantBusiness: {
    select: { id: true, systemCode: true, name: true, email: true, status: true },
  },
};

@Injectable()
export class TenantMappedBusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantMappedBusinessListQueryDto) {
    const { page, limit, search, tenantUserId, tenantBusinessId, status, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantUserId ? { tenantUserId } : {}),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { tenantUser: { fName: { contains: search } } },
              { tenantUser: { username: { contains: search } } },
              { tenantUser: { email: { contains: search } } },
              { tenantBusiness: { name: { contains: search } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantMappedBusiness.findMany({
        where,
        include: MAPPING_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantMappedBusiness.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: MAPPING_INCLUDE,
    });
    if (!mapping) throw new NotFoundException('Mapping not found');
    return mapping;
  }

  async create(dto: CreateMappedBusinessDto) {
    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: { id: dto.tenantUserId, status: { not: 'DELETED' } },
    });
    if (!tenantUser) throw new NotFoundException('Tenant user not found');

    const tenantBusiness = await this.prisma.tenantBusiness.findFirst({
      where: { id: dto.tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!tenantBusiness) throw new NotFoundException('Tenant business not found');

    const timestamp = now();
    const existing = await this.prisma.tenantMappedBusiness.findUnique({
      where: { tenantUserId: dto.tenantUserId },
    });

    if (existing) {
      if (existing.status !== 'DELETED') {
        throw new ConflictException(
          'This tenant user is already mapped to a business; edit the existing mapping instead',
        );
      }
      return this.prisma.tenantMappedBusiness.update({
        where: { id: existing.id },
        data: {
          tenantBusinessId: dto.tenantBusinessId,
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: timestamp,
        },
        include: MAPPING_INCLUDE,
      });
    }

    return this.prisma.tenantMappedBusiness.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('TMB'),
        tenantUserId: dto.tenantUserId,
        tenantBusinessId: dto.tenantBusinessId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: MAPPING_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateMappedBusinessDto) {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!mapping) throw new NotFoundException('Mapping not found');

    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: { id: dto.tenantUserId, status: { not: 'DELETED' } },
    });
    if (!tenantUser) throw new NotFoundException('Tenant user not found');

    const tenantBusiness = await this.prisma.tenantBusiness.findFirst({
      where: { id: dto.tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!tenantBusiness) throw new NotFoundException('Tenant business not found');

    if (dto.tenantUserId !== mapping.tenantUserId) {
      const clash = await this.prisma.tenantMappedBusiness.findUnique({
        where: { tenantUserId: dto.tenantUserId },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException('That tenant user is already mapped to a business');
      }
    }

    return this.prisma.tenantMappedBusiness.update({
      where: { id },
      data: {
        tenantUserId: dto.tenantUserId,
        tenantBusinessId: dto.tenantBusinessId,
        ...(dto.status ? { status: dto.status } : {}),
        updatedAt: now(),
      },
      include: MAPPING_INCLUDE,
    });
  }

  async changeStatus(id: string, dto: ChangeMappedBusinessStatusDto) {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!mapping) throw new NotFoundException('Mapping not found');

    return this.prisma.tenantMappedBusiness.update({
      where: { id },
      data: { status: dto.status, updatedAt: now() },
      include: MAPPING_INCLUDE,
    });
  }

  async remove(id: string) {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!mapping) throw new NotFoundException('Mapping not found');

    const timestamp = now();
    await this.prisma.tenantMappedBusiness.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found or not deleted');
    }
    return this.prisma.tenantMappedBusiness.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: MAPPING_INCLUDE,
    });
  }
}
