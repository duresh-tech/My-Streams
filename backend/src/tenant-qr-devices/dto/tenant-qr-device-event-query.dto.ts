import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantQrDeviceEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tenantQrDeviceId: z.string().uuid().optional(),
  tenantBusinessId: z.string().uuid().optional(),
  eventType: z
    .enum(['CREATED', 'CONFIG_UPDATED', 'PUSH_REQUESTED', 'TEST_TRIGGERED', 'PAYMENT_CONFIRMED', 'ERROR'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class TenantQrDeviceEventListQueryDto extends createZodDto(TenantQrDeviceEventListQuerySchema) {}
