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
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number, search?: string) {
    const where = {
      status: { not: 'DELETED' as const },
      ...(search
        ? {
            OR: [
              { displayName: { contains: search } },
              { moduleName: { contains: search } },
              { permissionKey: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        where,
        orderBy: [{ moduleName: 'asc' }, { permissionKey: 'asc' }],
        ...paginate(page, limit),
      }),
      this.prisma.permission.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: { permissionKey: dto.permissionKey },
    });
    if (existing) {
      throw new ConflictException(
        `Permission key "${dto.permissionKey}" already exists`,
      );
    }
    const timestamp = now();
    return this.prisma.permission.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('PRM'),
        ...dto,
        isSystem: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.findOne(id);
    if (permission.isSystem && dto.permissionKey) {
      throw new BadRequestException(
        'The key of a system permission cannot be changed',
      );
    }
    if (dto.permissionKey && dto.permissionKey !== permission.permissionKey) {
      const clash = await this.prisma.permission.findUnique({
        where: { permissionKey: dto.permissionKey },
      });
      if (clash) throw new ConflictException('Permission key already exists');
    }
    return this.prisma.permission.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
    });
  }

  async remove(id: string, allowSystem = false) {
    const permission = await this.findOne(id);
    if (permission.isSystem && !allowSystem) {
      throw new ForbiddenException(
        'Deleting a system permission requires the permissions:delete_system permission',
      );
    }
    const timestamp = now();
    await this.prisma.permission.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }
}
