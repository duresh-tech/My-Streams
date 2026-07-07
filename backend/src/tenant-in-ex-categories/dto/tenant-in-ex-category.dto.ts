import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InExCategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);
const InExCategoryStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantInExCategorySchema = z.object({
  tenantBusinessId: z.string().uuid(),
  type: InExCategoryTypeEnum,
  name: z.string().min(1).max(100),
  inExCode: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z0-9_]+$/, 'Must be uppercase letters, numbers, and underscores only'),
  description: z.string().max(255).optional(),
});

const UpdateTenantInExCategorySchema = CreateTenantInExCategorySchema.partial().extend({
  status: InExCategoryStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantInExCategoryDto extends createZodDto(
  CreateTenantInExCategorySchema,
) {}
export class UpdateTenantInExCategoryDto extends createZodDto(
  UpdateTenantInExCategorySchema,
) {}
