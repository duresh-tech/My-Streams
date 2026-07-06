import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantBusinessListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  country: z.string().max(100).optional(),
  isParentBusiness: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'country', 'city', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantBusinessListQueryDto extends createZodDto(TenantBusinessListQuerySchema) {}
