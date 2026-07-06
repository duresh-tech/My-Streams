import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UserStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateSystemUserSchema = z.object({
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

const UpdateSystemUserSchema = CreateSystemUserSchema.partial().extend({
  status: UserStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateSystemUserDto extends createZodDto(CreateSystemUserSchema) {}
export class UpdateSystemUserDto extends createZodDto(UpdateSystemUserSchema) {}
