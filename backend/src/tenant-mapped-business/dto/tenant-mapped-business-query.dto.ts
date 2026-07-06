import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantMappedBusinessListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  tenantUserId: z.string().uuid().optional(),
  tenantBusinessId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  sortBy: z.enum(['createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantMappedBusinessListQueryDto extends createZodDto(
  TenantMappedBusinessListQuerySchema,
) {}
