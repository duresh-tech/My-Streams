import {
  BadRequestException,
  ConflictException,
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
}
