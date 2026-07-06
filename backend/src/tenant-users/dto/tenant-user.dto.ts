import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UserStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantUserSchema = z.object({
  fName: z.string().min(1).max(100),
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email().max(191),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a digit'),
  roleId: z.string().uuid(),
});

const UpdateTenantUserSchema = CreateTenantUserSchema.partial().extend({
  status: UserStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantUserDto extends createZodDto(CreateTenantUserSchema) {}
export class UpdateTenantUserDto extends createZodDto(UpdateTenantUserSchema) {}
