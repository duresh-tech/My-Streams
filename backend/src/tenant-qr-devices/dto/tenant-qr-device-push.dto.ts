import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PushSchema = z.object({
  amount: z.coerce.number().positive().max(999999.99),
  note: z.string().max(100).optional(),
});

export class TenantQrDevicePushDto extends createZodDto(PushSchema) {}
