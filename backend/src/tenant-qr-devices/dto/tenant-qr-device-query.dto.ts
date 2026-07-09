import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantQrDeviceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  tenantBusinessId: z.string().uuid().optional(),
  tenantPlaceId: z.string().uuid().optional(),
  tenantCounterId: z.string().uuid().optional(),
  collectionMode: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
  sortBy: z.enum(['deviceName', 'deviceCode', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantQrDeviceListQueryDto extends createZodDto(TenantQrDeviceListQuerySchema) {}
