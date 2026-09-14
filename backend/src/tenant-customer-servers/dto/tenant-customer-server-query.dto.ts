import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantCustomerServerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DELETED']).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  tenantCustomerId: z.string().uuid().optional(),
  serverId: z.string().uuid().optional(),
  isDedicated: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'streamLimit', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantCustomerServerListQueryDto extends createZodDto(
  TenantCustomerServerListQuerySchema,
) {}
