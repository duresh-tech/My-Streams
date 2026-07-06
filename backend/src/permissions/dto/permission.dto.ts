import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PermissionStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'DELETED']);

const CreatePermissionSchema = z.object({
  displayName: z.string().min(1).max(100).describe('Ex. Delete Roles'),
  moduleName: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'moduleName must be kebab-case')
    .describe('Ex. roles'),
  permissionKey: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+:[a-z0-9-]+$/, 'Format: module:action, ex. roles:delete')
    .describe('Ex. roles:delete'),
  description: z.string().max(50).optional(),
});

const UpdatePermissionSchema = CreatePermissionSchema.partial().extend({
  status: PermissionStatusEnum.exclude(['DELETED']).optional(),
});

export class CreatePermissionDto extends createZodDto(CreatePermissionSchema) {}
export class UpdatePermissionDto extends createZodDto(UpdatePermissionSchema) {}
