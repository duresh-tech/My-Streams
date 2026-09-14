import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantFlussonicServerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'TERMINATED', 'DELETED']).optional(),
  // Lets a caller ask for servers it can actually reach - the stream forms
  // offer only ACTIVE + CONNECTED servers, since a push to anything else fails.
  connectionStatus: z.enum(['UNKNOWN', 'CONNECTED', 'UNAUTHORIZED', 'UNREACHABLE']).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'hostName', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantFlussonicServerListQueryDto extends createZodDto(
  TenantFlussonicServerListQuerySchema,
) {}
