import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');
const Money = z.coerce.number().min(0).max(99999999.99).multipleOf(0.01);

const RecordPaymentSchema = z.object({
  paymentModeId: z.string().uuid(),
  amount: Money.refine((amount) => amount > 0, 'Amount must be greater than zero'),
  /** Defaults to today; cannot be in the future. */
  paidDate: DateString.optional(),
  referenceNo: z.string().max(100).nullish(),
  remark: z.string().max(255).nullish(),
});

const InvoiceDraftSchema = z
  .object({
    customerId: z.string().uuid(),
    billFor: z.enum(['SERVER', 'STREAM']),
    /** SERVER: the customer's server assignment being billed. */
    assignmentId: z.string().uuid().optional(),
    /** STREAM: the one stream being billed. */
    streamId: z.string().uuid().optional(),
    /** Required for a new subscription. A renewal keeps its plan, so it may be omitted. */
    planId: z.string().uuid().optional(),
    /** New subscriptions only; defaults to today in the app timezone. */
    startDate: DateString.optional(),
    /** How many plan durations to bill ahead on this one invoice. Defaults to 1. */
    periods: z.coerce.number().int().min(1).max(24).optional(),
    /** Omitted = the business default from billing settings; null = no tax. */
    taxTypeId: z.string().uuid().nullish(),
    /** Requires tenant-invoices:add_discount when above zero. */
    discount: Money.optional(),
    notes: z.string().max(2000).nullish(),
    /** Create only: a payment recorded with the invoice. Requires tenant-payments:create. */
    payment: RecordPaymentSchema.optional(),
  })
  .superRefine((draft, ctx) => {
    if (draft.billFor === 'SERVER' && !draft.assignmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignmentId'],
        message: 'Choose the assigned server to bill',
      });
    }
    if (draft.billFor === 'STREAM' && !draft.streamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['streamId'],
        message: 'Choose the stream to bill',
      });
    }
  });

const VoidInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

const InvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(),
  customerId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'issueDate', 'dueDate', 'grandTotal']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const BillableCustomersQuerySchema = z.object({
  search: z.string().max(100).optional(),
});

export class CreateInvoiceDto extends createZodDto(InvoiceDraftSchema) {}
export class RecordPaymentDto extends createZodDto(RecordPaymentSchema) {}
export class VoidInvoiceDto extends createZodDto(VoidInvoiceSchema) {}
export class InvoiceListQueryDto extends createZodDto(InvoiceListQuerySchema) {}
export class BillableCustomersQueryDto extends createZodDto(BillableCustomersQuerySchema) {}
