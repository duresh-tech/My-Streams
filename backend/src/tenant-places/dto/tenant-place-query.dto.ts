import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantPlaceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  sortBy: z.enum(['placeName', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantPlaceListQueryDto extends createZodDto(TenantPlaceListQuerySchema) {}
