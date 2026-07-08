import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
} from './dto/tenant-user.dto';

const TENANT_USER_SELECT = {
  id: true,
  systemCode: true,
  fName: true,
  username: true,
  email: true,
  phone: true,
  avatarPath: true,
  roleId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, roleKey: true, displayName: true } },
} as const;

@Injectable()
export class TenantUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number, search?: string) {
    const where = {
      status: { not: 'DELETED' as const },
      ...(search
        ? {
            OR: [
              { fName: { contains: search } },
              { username: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantUser.findMany({
        where,
        select: TENANT_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        ...paginate(page, limit),
      }),
      this.prisma.tenantUser.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id, status: { not: 'DELETED' } },
      select: TENANT_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Tenant user not found');
    return user;
  }

  async create(dto: CreateTenantUserDto) {
    await this.assertUnique(dto.username, dto.email);
    await this.assertRoleAssignable(dto.roleId);

    const timestamp = now();
    return this.prisma.tenantUser.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('TNU'),
        fName: dto.fName,
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        avatarPath: dto.avatarPath,
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        roleId: dto.roleId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      select: TENANT_USER_SELECT,
    });
  }

  async update(id: string, dto: UpdateTenantUserDto) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!user) throw new NotFoundException('Tenant user not found');
    await this.assertUnique(dto.username, dto.email, id);
    if (dto.roleId) await this.assertRoleAssignable(dto.roleId);

    const { password, ...fields } = dto;
    return this.prisma.tenantUser.update({
      where: { id },
      data: {
        ...fields,
        ...(password
          ? { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) }
          : {}),
        updatedAt: now(),
      },
      select: TENANT_USER_SELECT,
    });
  }

  async remove(id: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!user) throw new NotFoundException('Tenant user not found');

    const timestamp = now();
    await this.prisma.tenantUser.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  private async assertUnique(username?: string, email?: string, excludeId?: string) {
    if (!username && !email) return;
    const clash = await this.prisma.tenantUser.findFirst({
      where: {
        OR: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email }] : []),
        ],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) throw new ConflictException('Username or email already in use');
  }

  private async assertRoleAssignable(roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, status: 'ACTIVE' },
    });
    if (!role) throw new BadRequestException('Role does not exist or is inactive');
    if (!role.visibleToTenants) {
      throw new BadRequestException('Role is not assignable to tenant users');
    }
  }

  // ---------- Tenant self-service (scoped to the caller's own business) ----------

  async listAssignableRoles() {
    return this.prisma.role.findMany({
      where: { visibleToTenants: true, status: 'ACTIVE' },
      select: { id: true, roleKey: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllForTenantUser(callerId: string, page: number, limit: number, search?: string) {
    const userIds = await this.getBusinessTenantUserIds(callerId);
    const where = {
      id: { in: userIds },
      status: { not: 'DELETED' as const },
      ...(search
        ? {
            OR: [
              { fName: { contains: search } },
              { username: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantUser.findMany({
        where,
        select: TENANT_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        ...paginate(page, limit),
      }),
      this.prisma.tenantUser.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(callerId: string, id: string) {
    await this.assertUserInCallerBusiness(callerId, id);
    return this.findOne(id);
  }

  async createForTenantUser(callerId: string, dto: CreateTenantUserDto) {
    const businessId = await this.getCallerBusinessId(callerId);
    await this.assertUnique(dto.username, dto.email);
    await this.assertRoleAssignable(dto.roleId);

    const timestamp = now();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.tenantUser.create({
        data: {
          id: newId(),
          systemCode: newSystemCode('TNU'),
          fName: dto.fName,
          username: dto.username,
          email: dto.email,
          phone: dto.phone,
          avatarPath: dto.avatarPath,
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          roleId: dto.roleId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        select: TENANT_USER_SELECT,
      });
      await tx.tenantMappedBusiness.create({
        data: {
          id: newId(),
          systemCode: newSystemCode('TMB'),
          tenantUserId: user.id,
          tenantBusinessId: businessId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      return user;
    });
  }

  async updateForTenantUser(callerId: string, id: string, dto: UpdateTenantUserDto) {
    await this.assertUserInCallerBusiness(callerId, id);
    return this.update(id, dto);
  }

  async removeForTenantUser(callerId: string, id: string) {
    if (id === callerId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.assertUserInCallerBusiness(callerId, id);
    return this.remove(id);
  }

  private async getCallerBusinessId(callerId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId: callerId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    if (!mapping) throw new ForbiddenException('You are not mapped to a business');
    return mapping.tenantBusinessId;
  }

  private async getBusinessTenantUserIds(callerId: string): Promise<string[]> {
    const businessId = await this.getCallerBusinessId(callerId);
    const mappings = await this.prisma.tenantMappedBusiness.findMany({
      where: { tenantBusinessId: businessId, status: 'ACTIVE' },
      select: { tenantUserId: true },
    });
    return mappings.map((m) => m.tenantUserId);
  }

  private async assertUserInCallerBusiness(callerId: string, targetUserId: string) {
    const userIds = await this.getBusinessTenantUserIds(callerId);
    if (!userIds.includes(targetUserId)) {
      throw new NotFoundException('Tenant user not found');
    }
  }
}
