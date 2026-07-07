import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantMailConfigListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  sortBy: z.enum(['mailHost', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantMailConfigListQueryDto extends createZodDto(
  TenantMailConfigListQuerySchema,
) {}
