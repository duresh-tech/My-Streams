import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number, search?: string) {
    const where = {
      status: { not: 'DELETED' as const },
      ...(search
        ? {
            OR: [
              { roleKey: { contains: search } },
              { displayName: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: {
          _count: {
            select: {
              systemUsers: { where: { status: { not: 'DELETED' } } },
              rolePermissions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...paginate(page, limit),
      }),
      this.prisma.role.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => rp.permission),
      rolePermissions: undefined,
    };
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { roleKey: dto.roleKey },
    });
    if (existing) {
      throw new ConflictException(`Role key "${dto.roleKey}" already exists`);
    }
    await this.assertPermissionsExist(dto.permissionIds);

    const timestamp = now();
    const role = await this.prisma.role.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('ROL'),
        roleKey: dto.roleKey,
        displayName: dto.displayName,
        visibleToTenants: dto.visibleToTenants,
        isSystem: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        rolePermissions: {
          create: dto.permissionIds.map((permissionId) => ({
            permissionId,
            createdAt: timestamp,
          })),
        },
      },
    });
    return this.findOne(role.id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && dto.roleKey && dto.roleKey !== role.roleKey) {
      throw new BadRequestException('The key of a system role cannot be changed');
    }
    if (dto.roleKey && dto.roleKey !== role.roleKey) {
      const clash = await this.prisma.role.findUnique({
        where: { roleKey: dto.roleKey },
      });
      if (clash) throw new ConflictException('Role key already exists');
    }

    const timestamp = now();
    const { permissionIds, ...fields } = dto;
    await this.prisma.role.update({
      where: { id },
      data: { ...fields, updatedAt: timestamp },
    });

    if (permissionIds) {
      await this.assertPermissionsExist(permissionIds);
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
            createdAt: timestamp,
          })),
        }),
      ]);
    }
    return this.findOne(id);
  }

  async remove(id: string, allowSystem = false) {
    const role = await this.prisma.role.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: {
        _count: { select: { systemUsers: { where: { status: { not: 'DELETED' } } } } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && !allowSystem) {
      throw new ForbiddenException(
        'Deleting a system role requires the roles:delete_system permission',
      );
    }
    if (role._count.systemUsers > 0) {
      throw new BadRequestException(
        'Role is assigned to users and cannot be deleted',
      );
    }
    const timestamp = now();
    await this.prisma.role.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  private async assertPermissionsExist(permissionIds?: string[]) {
    if (!permissionIds || permissionIds.length === 0) return;
    const count = await this.prisma.permission.count({
      where: { id: { in: permissionIds }, status: 'ACTIVE' },
    });
    if (count !== new Set(permissionIds).size) {
      throw new BadRequestException(
        'One or more permission ids do not exist or are inactive',
      );
    }
  }
}
