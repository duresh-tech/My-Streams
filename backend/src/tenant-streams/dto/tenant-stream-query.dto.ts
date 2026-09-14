import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantStreamListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  syncStatus: z
    .enum([
      'IN_SYNC',
      'PENDING_PUSH',
      'MISSING_ON_SERVER',
      'ORPHAN_ON_SERVER',
      'CONFLICT',
      'RENAMING',
      'TRANSFERRING',
      'UNREACHABLE',
    ])
    .optional(),
  tenantBusinessId: z.string().uuid().optional(),
  serverId: z.string().uuid().optional(),
  tenantCustomerId: z.string().uuid().optional(),
  disabled: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'title', 'createdAt', 'status', 'syncStatus']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantStreamListQueryDto extends createZodDto(TenantStreamListQuerySchema) {}
