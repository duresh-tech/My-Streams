import { Prisma } from '@prisma/client';
import { newId, newSystemCode } from '../common/utils/id.util';

/** The income category invoice payments are booked under, one per business. */
export const INVOICE_PAYMENT_CATEGORY_CODE = 'INVOICE_PAYMENT';

type Db = Prisma.TransactionClient;

/** Found by code, and created the first time a business collects a payment. */
async function invoicePaymentCategoryId(tx: Db, businessId: string, timestamp: number) {
  const existing = await tx.tenantInExCategory.findFirst({
    where: {
      tenantBusinessId: businessId,
      type: 'INCOME',
      inExCode: INVOICE_PAYMENT_CATEGORY_CODE,
      status: { not: 'DELETED' },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const id = newId();
  await tx.tenantInExCategory.create({
    data: {
      id,
      systemCode: newSystemCode('INX'),
      tenantBusinessId: businessId,
      type: 'INCOME',
      name: 'Invoice Payment',
      inExCode: INVOICE_PAYMENT_CATEGORY_CODE,
      description: 'Payments collected against invoices, recorded automatically',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  return id;
}

/** Books a recorded invoice payment as income, inside the payment's transaction. */
export async function recordPaymentIncome(
  tx: Db,
  payment: {
    id: string;
    tenantBusinessId: string;
    tenantPaymentModeId: string;
    amount: Prisma.Decimal;
    paidAt: bigint;
    referenceNo: string | null;
  },
  invoiceNumber: string | null,
  actorId: string,
  timestamp: number,
) {
  await tx.tenantIncomeExpense.create({
    data: {
      id: newId(),
      systemCode: newSystemCode('IEX'),
      tenantBusinessId: payment.tenantBusinessId,
      tenantInExCategoryId: await invoicePaymentCategoryId(tx, payment.tenantBusinessId, timestamp),
      tenantPaymentModeId: payment.tenantPaymentModeId,
      tenantPaymentId: payment.id,
      type: 'INCOME',
      amount: payment.amount,
      entryDate: payment.paidAt,
      referenceNo: payment.referenceNo,
      remark: `Payment for invoice ${invoiceNumber ?? ''}`.trim(),
      createdAt: timestamp,
      createdBy: actorId,
      updatedAt: timestamp,
      updatedBy: actorId,
    },
  });
}

/** Voids the income entries of voided payments, so the ledger reverses with them. */
export async function voidPaymentIncome(
  tx: Db,
  paymentIds: string[],
  actorId: string,
  timestamp: number,
) {
  await tx.tenantIncomeExpense.updateMany({
    where: { tenantPaymentId: { in: paymentIds }, status: 'ACTIVE' },
    data: { status: 'VOID', updatedAt: timestamp, updatedBy: actorId },
  });
}
