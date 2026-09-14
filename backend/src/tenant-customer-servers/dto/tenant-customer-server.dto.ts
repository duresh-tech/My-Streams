import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AssignmentStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'DELETED']);

const CreateTenantCustomerServerSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  tenantCustomerId: z.string().uuid(),
  serverId: z.string().uuid(),
  // Null means unlimited, which is not the same as 0 - zero would forbid every
  // stream rather than leaving the count uncapped.
  streamLimit: z.coerce.number().int().min(0).max(100000).nullish(),
  isDedicated: z.boolean().default(false),
  remark: z.string().max(255).nullish(),
});

const UpdateTenantCustomerServerSchema = z.object({
  // Reassignable, but not while the customer has streams on the current server
  // - see the service, which refuses that rather than orphaning them.
  tenantCustomerId: z.string().uuid().optional(),
  serverId: z.string().uuid().optional(),
  streamLimit: z.coerce.number().int().min(0).max(100000).nullish(),
  isDedicated: z.boolean().optional(),
  remark: z.string().max(255).nullish(),
  status: AssignmentStatusEnum.exclude(['DELETED']).optional(),
});

/** Tenant portal: the business comes from the caller, never the body. */
const CreateTenantCustomerServerSelfSchema = CreateTenantCustomerServerSchema.omit({
  tenantBusinessId: true,
});

export class CreateTenantCustomerServerDto extends createZodDto(
  CreateTenantCustomerServerSchema,
) {}
export class UpdateTenantCustomerServerDto extends createZodDto(
  UpdateTenantCustomerServerSchema,
) {}
export class CreateTenantCustomerServerSelfDto extends createZodDto(
  CreateTenantCustomerServerSelfSchema,
) {}
export class UpdateTenantCustomerServerSelfDto extends createZodDto(
  UpdateTenantCustomerServerSchema,
) {}
