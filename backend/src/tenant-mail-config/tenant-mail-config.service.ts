import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sendSmtpMail } from '../common/utils/mail.util';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantMailConfigDto,
  TestTenantMailConfigDto,
  UpdateTenantMailConfigDto,
} from './dto/tenant-mail-config.dto';
import { TenantMailConfigListQueryDto } from './dto/tenant-mail-config-query.dto';

const MAIL_CONFIG_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

/**
 * Never return the raw SMTP password over the API. Callers only need to know
 * whether one is set (hasPassword); the actual value is write-only.
 */
function sanitize<T extends { mailPassword: string | null }>(row: T) {
  const { mailPassword, ...rest } = row;
  return { ...rest, hasPassword: !!mailPassword };
}

@Injectable()
export class TenantMailConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantMailConfigListQueryDto) {
    const { page, limit, search, tenantBusinessId, sortBy, sortOrder } = query;
    const where = {
      deletedAt: null,
      ...(tenantBusinessId ? { tenantBusinessId } : {}),
      ...(search
        ? {
            OR: [
              { mailHost: { contains: search } },
              { fromMailAddress: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantMailConfig.findMany({
        where,
        include: MAIL_CONFIG_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantMailConfig.count({ where }),
    ]);
    return listResponse(items.map(sanitize), total, page, limit);
  }

  async findOne(id: string) {
    const config = await this.prisma.tenantMailConfig.findFirst({
      where: { id, deletedAt: null },
      include: MAIL_CONFIG_INCLUDE,
    });
    if (!config) throw new NotFoundException('Mail config not found');
    return sanitize(config);
  }

  async create(dto: CreateTenantMailConfigDto) {
    await this.assertBusinessExists(dto.tenantBusinessId);

    const timestamp = now();
    const created = await this.prisma.tenantMailConfig.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('MLC'),
        tenantBusinessId: dto.tenantBusinessId,
        mailDriver: dto.mailDriver,
        mailHost: dto.mailHost,
        mailPort: dto.mailPort,
        mailUsername: dto.mailUsername,
        mailPassword: dto.mailPassword,
        mailEncryption: dto.mailEncryption,
        fromMailAddress: dto.fromMailAddress,
        fromMailName: dto.fromMailName,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: MAIL_CONFIG_INCLUDE,
    });
    return sanitize(created);
  }

  async update(id: string, dto: UpdateTenantMailConfigDto) {
    const config = await this.prisma.tenantMailConfig.findFirst({ where: { id, deletedAt: null } });
    if (!config) throw new NotFoundException('Mail config not found');
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);

    const updated = await this.prisma.tenantMailConfig.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
      include: MAIL_CONFIG_INCLUDE,
    });
    return sanitize(updated);
  }

  async remove(id: string) {
    const config = await this.prisma.tenantMailConfig.findFirst({ where: { id, deletedAt: null } });
    if (!config) throw new NotFoundException('Mail config not found');

    await this.prisma.tenantMailConfig.update({
      where: { id },
      data: { deletedAt: now(), updatedAt: now() },
    });
    return { success: true };
  }

  async sendTestEmail(id: string, dto: TestTenantMailConfigDto) {
    const config = await this.prisma.tenantMailConfig.findFirst({ where: { id, deletedAt: null } });
    if (!config) throw new NotFoundException('Mail config not found');
    return this.deliverTestEmail(config, dto.toEmail);
  }

  private async deliverTestEmail(
    config: {
      mailHost: string | null;
      mailPort: number | null;
      mailUsername: string | null;
      mailPassword: string | null;
      mailEncryption: string;
      fromMailAddress: string | null;
      fromMailName: string | null;
    },
    toEmail: string,
  ) {
    if (!config.mailHost || !config.mailPort) {
      throw new BadRequestException('mailHost and mailPort must be set before sending a test email');
    }
    if (!config.fromMailAddress) {
      throw new BadRequestException('fromMailAddress must be set before sending a test email');
    }

    try {
      await sendSmtpMail(config, {
        to: toEmail,
        subject: 'Test email',
        text: 'This is a test email to verify your mail configuration is working correctly.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send test email';
      throw new BadRequestException(`Failed to send test email: ${message}`);
    }
    return { success: true };
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

  async findAllForTenantUser(tenantUserId: string, query: TenantMailConfigListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const { page, limit, search, tenantBusinessId, sortBy, sortOrder } = query;
    const scopedBusinessIds = tenantBusinessId
      ? businessIds.filter((id) => id === tenantBusinessId)
      : businessIds;
    const where = {
      tenantBusinessId: { in: scopedBusinessIds },
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { mailHost: { contains: search } },
              { fromMailAddress: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantMailConfig.findMany({
        where,
        include: MAIL_CONFIG_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantMailConfig.count({ where }),
    ]);
    return listResponse(items.map(sanitize), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const config = await this.prisma.tenantMailConfig.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, deletedAt: null },
      include: MAIL_CONFIG_INCLUDE,
    });
    if (!config) throw new NotFoundException('Mail config not found');
    return sanitize(config);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantMailConfigDto) {
    await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const existing = await this.prisma.tenantMailConfig.count({
      where: { tenantBusinessId: { in: businessIds }, deletedAt: null },
    });
    if (existing > 0) {
      throw new BadRequestException('Only one mail config is allowed per account. Delete the existing config before adding a new one.');
    }
    return this.create(dto);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantMailConfigDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    if (dto.tenantBusinessId) await this.assertBusinessOwned(tenantUserId, dto.tenantBusinessId);
    return this.update(id, dto);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id);
  }

  async sendTestEmailForTenantUser(tenantUserId: string, id: string, dto: TestTenantMailConfigDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const config = await this.prisma.tenantMailConfig.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, deletedAt: null },
    });
    if (!config) throw new NotFoundException('Mail config not found');
    return this.deliverTestEmail(config, dto.toEmail);
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
