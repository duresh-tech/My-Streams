import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, now } from '../common/utils/id.util';
import { formatInvoiceNumber } from './billing-math';
import { UpdateTenantBillingSettingsDto } from './dto/tenant-billing-settings.dto';

const SETTINGS_INCLUDE = {
  defaultTaxType: {
    select: { id: true, taxName: true, calculationType: true, value: true, status: true },
  },
} satisfies Prisma.TenantBillingSettingsInclude;

type SettingsRow = Prisma.TenantBillingSettingsGetPayload<{ include: typeof SETTINGS_INCLUDE }>;

/**
 * One settings row per business. There is no create endpoint: the row is
 * created with defaults the first time it is read, so every business has
 * working billing defaults without a setup step.
 */
@Injectable()
export class TenantBillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantBusinessId: string, actorId?: string) {
    await this.assertBusinessExists(tenantBusinessId);
    return this.serialize(await this.findOrCreate(tenantBusinessId, actorId));
  }

  async update(tenantBusinessId: string, dto: UpdateTenantBillingSettingsDto, actorId?: string) {
    await this.assertBusinessExists(tenantBusinessId);
    const current = await this.findOrCreate(tenantBusinessId, actorId);

    if (dto.defaultTaxTypeId) {
      const taxType = await this.prisma.tenantTaxType.findFirst({
        where: { id: dto.defaultTaxTypeId, tenantBusinessId, status: 'ACTIVE' },
      });
      if (!taxType) {
        throw new BadRequestException('Default tax type must be an active tax type of this business');
      }
    }

    // Moving the sequence after an invoice is issued would either reuse an
    // issued number or leave a gap in the series, so it is fixed from then on.
    if (
      dto.nextInvoiceNumber !== undefined &&
      dto.nextInvoiceNumber !== current.nextInvoiceNumber &&
      (await this.isInvoiceNumberLocked(tenantBusinessId))
    ) {
      throw new BadRequestException(
        'The next invoice number cannot be changed once an invoice has been issued',
      );
    }

    const data: Prisma.TenantBillingSettingsUncheckedUpdateInput = {
      ...dto,
      updatedAt: now(),
      updatedBy: actorId,
    };
    const updated = await this.prisma.tenantBillingSettings.update({
      where: { tenantBusinessId },
      data,
      include: SETTINGS_INCLUDE,
    });
    return this.serialize(updated);
  }

  async findOrCreate(tenantBusinessId: string, actorId?: string): Promise<SettingsRow> {
    const existing = await this.prisma.tenantBillingSettings.findUnique({
      where: { tenantBusinessId },
      include: SETTINGS_INCLUDE,
    });
    if (existing) return existing;

    const timestamp = now();
    try {
      return await this.prisma.tenantBillingSettings.create({
        data: {
          id: newId(),
          tenantBusinessId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId,
        },
        include: SETTINGS_INCLUDE,
      });
    } catch (error) {
      // Two first reads at once: the other request created the row, so use it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.tenantBillingSettings.findUniqueOrThrow({
          where: { tenantBusinessId },
          include: SETTINGS_INCLUDE,
        });
      }
      throw error;
    }
  }

  private async serialize(row: SettingsRow) {
    return {
      ...row,
      nextInvoiceNumberPreview: formatInvoiceNumber(row.invoicePrefix, row.nextInvoiceNumber),
      invoiceNumberLocked: await this.isInvoiceNumberLocked(row.tenantBusinessId),
    };
  }

  private async isInvoiceNumberLocked(tenantBusinessId: string): Promise<boolean> {
    const issued = await this.prisma.tenantInvoice.count({
      where: { tenantBusinessId, invoiceNumber: { not: null } },
    });
    return issued > 0;
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
    }
  }

  // ---------- Tenant self-service (scoped to the caller's business) ----------

  async getForTenantUser(tenantUserId: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.get(tenantBusinessId, tenantUserId);
  }

  async updateForTenantUser(tenantUserId: string, dto: UpdateTenantBillingSettingsDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.update(tenantBusinessId, dto, tenantUserId);
  }

  private async getMappedBusinessId(tenantUserId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    if (!mapping) {
      throw new ForbiddenException('Your account is not mapped to a business');
    }
    return mapping.tenantBusinessId;
  }
}
