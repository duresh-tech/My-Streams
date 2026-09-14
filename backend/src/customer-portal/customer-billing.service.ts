import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { now } from '../common/utils/id.util';
import { CustomerAuthUser } from '../common/decorators/current-customer.decorator';

/** A customer's own invoices, never drafts. */
const customerInvoiceScope = (customer: CustomerAuthUser): Prisma.TenantInvoiceWhereInput => ({
  tenantCustomerId: customer.id,
  tenantBusinessId: customer.tenantBusinessId,
  status: { not: 'DRAFT' },
});

function isOverdue(row: { status: string; dueDate: bigint | null }) {
  return (
    (row.status === 'ISSUED' || row.status === 'PARTIALLY_PAID') &&
    row.dueDate !== null &&
    Number(row.dueDate) < now()
  );
}

/** A cancelled invoice owes nothing, whatever its total was. */
function balanceDue(row: { status: string; grandTotal: Prisma.Decimal; amountPaid: Prisma.Decimal }) {
  return row.status === 'VOID' ? 0 : Number(row.grandTotal.minus(row.amountPaid));
}

/**
 * Read-only billing for the customer portal. Scoped to the signed-in customer
 * like the rest of the portal. The tenant's bookkeeping - who issued or
 * cancelled, the cancel reason, voided payments - is not shown.
 */
@Injectable()
export class CustomerBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvoices(customer: CustomerAuthUser) {
    const invoices = await this.prisma.tenantInvoice.findMany({
      where: customerInvoiceScope(customer),
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        grandTotal: true,
        amountPaid: true,
        items: { select: { description: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return invoices.map(({ items, grandTotal, amountPaid, ...invoice }) => ({
      ...invoice,
      description: items[0]?.description ?? null,
      grandTotal: Number(grandTotal),
      amountPaid: Number(amountPaid),
      balanceDue: balanceDue({ status: invoice.status, grandTotal, amountPaid }),
      isOverdue: isOverdue(invoice),
    }));
  }

  async getInvoice(customer: CustomerAuthUser, id: string) {
    const invoice = await this.prisma.tenantInvoice.findFirst({
      where: { id, ...customerInvoiceScope(customer) },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        grandTotal: true,
        amountPaid: true,
        billedTo: true,
        billedFrom: true,
        notes: true,
        voidedAt: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            description: true,
            periodStart: true,
            periodEnd: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            taxName: true,
            taxAmount: true,
            lineTotal: true,
          },
        },
        payments: {
          where: { status: 'RECORDED' },
          orderBy: { paidAt: 'desc' },
          select: {
            id: true,
            amount: true,
            paidAt: true,
            referenceNo: true,
            tenantPaymentMode: { select: { paymentName: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const { items, payments, subtotal, discountTotal, taxTotal, grandTotal, amountPaid, ...rest } = invoice;
    return {
      ...rest,
      subtotal: Number(subtotal),
      discountTotal: Number(discountTotal),
      taxTotal: Number(taxTotal),
      grandTotal: Number(grandTotal),
      amountPaid: Number(amountPaid),
      balanceDue: balanceDue({ status: rest.status, grandTotal, amountPaid }),
      isOverdue: isOverdue(rest),
      items: items.map(({ unitPrice, discount, taxAmount, lineTotal, ...item }) => ({
        ...item,
        unitPrice: Number(unitPrice),
        discount: Number(discount),
        taxAmount: Number(taxAmount),
        lineTotal: Number(lineTotal),
      })),
      payments: payments.map(({ tenantPaymentMode, amount, ...payment }) => ({
        ...payment,
        amount: Number(amount),
        paymentMode: tenantPaymentMode.paymentName,
      })),
    };
  }
}
