import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');
const Money = z.coerce
  .number()
  .max(99999999.99)
  .multipleOf(0.01)
  .refine((amount) => amount > 0, 'Amount must be greater than zero');

const EntrySchema = z.object({
  /** The entry's type (income or expense) is taken from the category. */
  tenantInExCategoryId: z.string().uuid(),
  amount: Money,
  entryDate: DateString,
  tenantPaymentModeId: z.string().uuid().nullish(),
  referenceNo: z.string().trim().max(100).nullish(),
  remark: z.string().trim().max(255).nullish(),
});

const FilterSchema = z.object({
  search: z.string().max(100).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  tenantInExCategoryId: z.string().uuid().optional(),
  tenantPaymentModeId: z.string().uuid().optional(),
  /** Omitted = ACTIVE and VOID; DELETED entries are never listed. */
  status: z.enum(['ACTIVE', 'VOID']).optional(),
  /** Inclusive calendar dates in the app timezone. */
  from: DateString.optional(),
  to: DateString.optional(),
});

const ListQuerySchema = FilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['entryDate', 'amount', 'createdAt']).default('entryDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class CreateTenantIncomeExpenseDto extends createZodDto(EntrySchema) {}
export class UpdateTenantIncomeExpenseDto extends createZodDto(EntrySchema.partial()) {}
export class TenantIncomeExpenseFilterDto extends createZodDto(FilterSchema) {}
export class TenantIncomeExpenseListQueryDto extends createZodDto(ListQuerySchema) {}
