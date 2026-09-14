import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AdoptStreamSchema = z.object({
  /** The server-side name, which must be exactly application/key. */
  name: z.string().min(1).max(200),
  tenantCustomerId: z.string().uuid().optional(),
});

export class AdoptStreamDto extends createZodDto(AdoptStreamSchema) {}
