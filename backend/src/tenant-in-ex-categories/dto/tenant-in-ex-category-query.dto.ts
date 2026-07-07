import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantInExCategoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'inExCode', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantInExCategoryListQueryDto extends createZodDto(
  TenantInExCategoryListQuerySchema,
) {}
