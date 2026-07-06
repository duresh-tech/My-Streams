import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateTenantAccountSchema = z.object({
  fName: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional(),
  email: z.string().email().max(191).optional(),
  phone: z.string().min(5).max(20).optional(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a digit')
    .optional(),
});

export class UpdateTenantAccountDto extends createZodDto(UpdateTenantAccountSchema) {}
