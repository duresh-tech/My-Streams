import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ExpenseCategoryStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantExpenseCategorySchema = z.object({
  tenantBusinessId: z.string().uuid(),
  expenseCategorieName: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

const UpdateTenantExpenseCategorySchema = CreateTenantExpenseCategorySchema.partial().extend({
  status: ExpenseCategoryStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantExpenseCategoryDto extends createZodDto(
  CreateTenantExpenseCategorySchema,
) {}
export class UpdateTenantExpenseCategoryDto extends createZodDto(
  UpdateTenantExpenseCategorySchema,
) {}
