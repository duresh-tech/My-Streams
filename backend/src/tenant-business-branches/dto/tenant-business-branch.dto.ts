import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const BranchStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantBusinessBranchSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  branchName: z.string().min(1).max(150),
  email: z.string().email().max(150),
  phone: z.string().min(1).max(20),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  description: z.string().max(255).optional(),
});

const UpdateTenantBusinessBranchSchema = CreateTenantBusinessBranchSchema.partial().extend({
  status: BranchStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantBusinessBranchDto extends createZodDto(CreateTenantBusinessBranchSchema) {}
export class UpdateTenantBusinessBranchDto extends createZodDto(UpdateTenantBusinessBranchSchema) {}
