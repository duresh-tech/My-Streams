import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantQrDisplayTemplateDto,
  UpdateTenantQrDisplayTemplateDto,
} from './dto/tenant-qr-display-template.dto';
import { TenantQrDisplayTemplateListQueryDto } from './dto/tenant-qr-display-template-query.dto';

const TEMPLATE_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOADS_FOLDER = 'qr_display_templates';

@Injectable()
export class TenantQrDisplayTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: TenantQrDisplayTemplateListQueryDto) {
    const { page, limit, search, status, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search ? { OR: [{ templateName: { contains: search } }, { systemCode: { contains: search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantQrDisplayTemplate.findMany({
        where,
        include: TEMPLATE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantQrDisplayTemplate.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Display template not found');
    return template;
  }

  async create(dto: CreateTenantQrDisplayTemplateDto) {
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.isSystemDefault && dto.tenantBusinessId) {
      throw new BadRequestException('Only a system-wide template (no tenantBusinessId) can be marked as the default');
    }

    const timestamp = now();
    return this.prisma.tenantQrDisplayTemplate.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('QDT'),
        tenantBusinessId: dto.tenantBusinessId,
        templateName: dto.templateName,
        backgroundImagePath: dto.backgroundImagePath,
        logoOverridePath: dto.logoOverridePath,
        primaryColor: dto.primaryColor,
        footerText: dto.footerText,
        isSystemDefault: dto.isSystemDefault ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTenantQrDisplayTemplateDto) {
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!template) throw new NotFoundException('Display template not found');
    if (dto.isSystemDefault && template.tenantBusinessId) {
      throw new BadRequestException('Only a system-wide template (no tenantBusinessId) can be marked as the default');
    }

    return this.prisma.tenantQrDisplayTemplate.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: TEMPLATE_INCLUDE,
    });
  }

  async remove(id: string) {
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!template) throw new NotFoundException('Display template not found');

    const timestamp = now();
    await this.prisma.tenantQrDisplayTemplate.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!template) throw new NotFoundException('Display template not found or not deleted');
    return this.prisma.tenantQrDisplayTemplate.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
      include: TEMPLATE_INCLUDE,
    });
  }

  async uploadAsset(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_UPLOAD_SIZE) throw new BadRequestException('File exceeds the 5 MB limit');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('File must be an image');
    const path = await this.storage.upload(file, UPLOADS_FOLDER);
    return { path };
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
    }
  }

  // ---------- Tenant self-service (own business templates + visible system presets) ----------

  async listMappedBusinesses(tenantUserId: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    return this.prisma.tenantBusiness.findMany({
      where: { id: { in: businessIds }, status: { not: 'DELETED' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAllForTenantUser(tenantUserId: string, query: TenantQrDisplayTemplateListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where = {
      OR: [{ tenantBusinessId: null }, { tenantBusinessId: { in: businessIds } }],
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(search ? { AND: [{ templateName: { contains: search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantQrDisplayTemplate.findMany({
        where,
        include: TEMPLATE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantQrDisplayTemplate.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: {
        id,
        status: { not: 'DELETED' },
        OR: [{ tenantBusinessId: null }, { tenantBusinessId: { in: businessIds } }],
      },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Display template not found');
    return template;
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantQrDisplayTemplateDto) {
    if (!dto.tenantBusinessId) {
      throw new BadRequestException('tenantBusinessId is required');
    }
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    // A tenant can only ever create their own business-scoped template, never a system default.
    return this.create({ ...dto, isSystemDefault: false });
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantQrDisplayTemplateDto) {
    const template = await this.assertOwnedTemplate(tenantUserId, id);
    return this.update(template.id, { ...dto, isSystemDefault: false });
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    const template = await this.assertOwnedTemplate(tenantUserId, id);
    return this.remove(template.id);
  }

  private async assertOwnedTemplate(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const template = await this.prisma.tenantQrDisplayTemplate.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!template) throw new NotFoundException('Display template not found');
    if (!template.tenantBusinessId || !businessIds.includes(template.tenantBusinessId)) {
      throw new ForbiddenException('You cannot modify a system-wide template');
    }
    return template;
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
