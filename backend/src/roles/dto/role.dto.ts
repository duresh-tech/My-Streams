import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RoleStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateRoleSchema = z.object({
  roleKey: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'roleKey must be UPPER_SNAKE_CASE')
    .describe('Ex. TENANT_SUPER_ADMIN'),
  displayName: z.string().min(1).max(100),
  visibleToTenants: z.boolean().default(false),
  permissionIds: z
    .array(z.string().uuid())
    .default([])
    .describe('Permission ids to attach to the role'),
});

const UpdateRoleSchema = CreateRoleSchema.partial().extend({
  status: RoleStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateRoleDto extends createZodDto(CreateRoleSchema) {}
export class UpdateRoleDto extends createZodDto(UpdateRoleSchema) {}
