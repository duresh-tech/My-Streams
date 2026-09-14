import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { getMappedBusinessId } from '../tenant-billing/billing-scope';
import { addDuration, startOfDate } from '../tenant-billing/billing-math';
import {
  CreateTenantIncomeExpenseDto,
  TenantIncomeExpenseFilterDto,
  TenantIncomeExpenseListQueryDto,
  UpdateTenantIncomeExpenseDto,
} from './dto/tenant-income-expense.dto';

const ENTRY_INCLUDE = {
  tenantInExCategory: { select: { id: true, name: true, type: true } },
  tenantPaymentMode: { select: { id: true, paymentName: true } },
  tenantPayment: { select: { tenantInvoice: { select: { id: true, invoiceNumber: true } } } },
} satisfies Prisma.TenantIncomeExpenseInclude;

type EntryRow = Prisma.TenantIncomeExpenseGetPayload<{ include: typeof ENTRY_INCLUDE }>;

/** Money leaves as a number, and the vendor-free relation names are used. */
function serializeEntry(row: EntryRow) {
  const { tenantInExCategory, tenantPaymentMode, tenantPayment, amount, ...rest } = row;
  return {
    ...rest,
    amount: Number(amount),
    category: tenantInExCategory,
    paymentMode: tenantPaymentMode,
    /** Set when the entry was recorded from an invoice payment; such entries are read-only. */
    invoice: tenantPayment?.tenantInvoice ?? null,
  };
}

function dayStart(date: string, field: string): number {
  try {
    return startOfDate(date);
  } catch (error) {
    if (error instanceof RangeError) throw new BadRequestException(`${field}: ${error.message}`);
    throw error;
  }
}

/**
 * The business's income and expense ledger. Scoped to the caller's mapped
 * business. Manual entries are fully editable; entries booked by invoice
 * payments follow their payment and are reversed by cancelling the invoice.
 */
@Injectable()
export class TenantIncomeExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active categories (the business's own and the global system ones), payment
   * modes, and the billing currency - null until billing settings exist.
   */
  async optionsForTenantUser(tenantUserId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const [categories, paymentModes, settings] = await Promise.all([
      this.prisma.tenantInExCategory.findMany({
        where: { status: 'ACTIVE', OR: [{ tenantBusinessId: businessId }, { isSystem: true }] },
        select: { id: true, name: true, type: true, inExCode: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tenantPaymentMode.findMany({
        where: { tenantBusinessId: businessId, status: 'ACTIVE' },
        select: { id: true, paymentName: true },
        orderBy: { paymentName: 'asc' },
      }),
      this.prisma.tenantBillingSettings.findUnique({
        where: { tenantBusinessId: businessId },
        select: { currency: true },
      }),
    ]);
    return { currency: settings?.currency ?? null, categories, paymentModes };
  }

  async listForTenantUser(tenantUserId: string, query: TenantIncomeExpenseListQueryDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(businessId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantIncomeExpense.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ [sortBy]: sortOrder }, { createdAt: 'desc' }],
        ...paginate(page, limit),
      }),
      this.prisma.tenantIncomeExpense.count({ where }),
    ]);
    return listResponse(items.map(serializeEntry), total, page, limit);
  }

  /** Income, expense and net for the same filters as the list. Voided entries never count. */
  async summaryForTenantUser(tenantUserId: string, query: TenantIncomeExpenseFilterDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const groups = await this.prisma.tenantIncomeExpense.groupBy({
      by: ['type'],
      where: { AND: [this.buildWhere(businessId, query), { status: 'ACTIVE' }] },
      _sum: { amount: true },
    });
    const sum = (type: 'INCOME' | 'EXPENSE') =>
      groups.find((group) => group.type === type)?._sum.amount ?? new Prisma.Decimal(0);
    const income = sum('INCOME');
    const expense = sum('EXPENSE');
    return { income: Number(income), expense: Number(expense), net: Number(income.minus(expense)) };
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    return serializeEntry(await this.findRow(businessId, id));
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantIncomeExpenseDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const category = await this.requireCategory(businessId, dto.tenantInExCategoryId);
    if (dto.tenantPaymentModeId) await this.requirePaymentMode(businessId, dto.tenantPaymentModeId);

    const timestamp = now();
    const row = await this.prisma.tenantIncomeExpense.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('IEX'),
        tenantBusinessId: businessId,
        tenantInExCategoryId: category.id,
        tenantPaymentModeId: dto.tenantPaymentModeId ?? null,
        type: category.type,
        amount: new Prisma.Decimal(dto.amount),
        entryDate: dayStart(dto.entryDate, 'entryDate'),
        referenceNo: dto.referenceNo || null,
        remark: dto.remark || null,
        createdAt: timestamp,
        createdBy: tenantUserId,
        updatedAt: timestamp,
        updatedBy: tenantUserId,
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantIncomeExpenseDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const existing = await this.requireEditable(businessId, id);

    let categoryChange = {};
    if (dto.tenantInExCategoryId && dto.tenantInExCategoryId !== existing.tenantInExCategoryId) {
      const category = await this.requireCategory(businessId, dto.tenantInExCategoryId);
      categoryChange = { tenantInExCategoryId: category.id, type: category.type };
    }
    if (dto.tenantPaymentModeId) await this.requirePaymentMode(businessId, dto.tenantPaymentModeId);

    const row = await this.prisma.tenantIncomeExpense.update({
      where: { id: existing.id },
      data: {
        ...categoryChange,
        ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(dto.entryDate ? { entryDate: dayStart(dto.entryDate, 'entryDate') } : {}),
        ...(dto.tenantPaymentModeId !== undefined ? { tenantPaymentModeId: dto.tenantPaymentModeId } : {}),
        ...(dto.referenceNo !== undefined ? { referenceNo: dto.referenceNo || null } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark || null } : {}),
        updatedAt: now(),
        updatedBy: tenantUserId,
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const existing = await this.requireEditable(businessId, id);
    const timestamp = now();
    await this.prisma.tenantIncomeExpense.update({
      where: { id: existing.id },
      data: {
        status: 'DELETED',
        deletedAt: timestamp,
        deletedBy: tenantUserId,
        updatedAt: timestamp,
        updatedBy: tenantUserId,
      },
    });
    return { success: true };
  }

  private buildWhere(
    businessId: string,
    query: TenantIncomeExpenseFilterDto,
  ): Prisma.TenantIncomeExpenseWhereInput {
    const { search, type, tenantInExCategoryId, tenantPaymentModeId, status, from, to } = query;
    return {
      tenantBusinessId: businessId,
      status: status ?? { not: 'DELETED' },
      ...(type ? { type } : {}),
      ...(tenantInExCategoryId ? { tenantInExCategoryId } : {}),
      ...(tenantPaymentModeId ? { tenantPaymentModeId } : {}),
      ...(from || to
        ? {
            entryDate: {
              ...(from ? { gte: dayStart(from, 'from') } : {}),
              // `to` is inclusive: everything before the start of the next day.
              ...(to ? { lt: addDuration(dayStart(to, 'to'), 1, 'DAY') } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search } },
              { referenceNo: { contains: search } },
              { remark: { contains: search } },
              { tenantInExCategory: { name: { contains: search } } },
            ],
          }
        : {}),
    };
  }

  private async findRow(businessId: string, id: string) {
    const row = await this.prisma.tenantIncomeExpense.findFirst({
      where: { id, tenantBusinessId: businessId, status: { not: 'DELETED' } },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw new NotFoundException('Income/expense entry not found');
    return row;
  }

  private async requireEditable(businessId: string, id: string) {
    const row = await this.findRow(businessId, id);
    if (row.tenantPaymentId) {
      throw new BadRequestException(
        `This entry was recorded from a payment on invoice ${row.tenantPayment?.tenantInvoice.invoiceNumber ?? ''}. ` +
          'Cancel the invoice to reverse it.',
      );
    }
    if (row.status === 'VOID') throw new BadRequestException('A voided entry cannot be changed');
    return row;
  }

  private async requireCategory(businessId: string, id: string) {
    const category = await this.prisma.tenantInExCategory.findFirst({
      where: { id, status: 'ACTIVE', OR: [{ tenantBusinessId: businessId }, { isSystem: true }] },
      select: { id: true, type: true },
    });
    if (!category) throw new BadRequestException('Category not found or not active');
    return category;
  }

  private async requirePaymentMode(businessId: string, id: string) {
    const mode = await this.prisma.tenantPaymentMode.findFirst({
      where: { id, tenantBusinessId: businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!mode) throw new BadRequestException('Payment mode not found or not active');
  }
}
