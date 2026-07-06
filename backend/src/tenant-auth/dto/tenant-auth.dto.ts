import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantLoginSchema = z.object({
  username: z.string().min(3).max(191),
  password: z.string().min(8).max(128),
});

export class TenantLoginDto extends createZodDto(TenantLoginSchema) {}
