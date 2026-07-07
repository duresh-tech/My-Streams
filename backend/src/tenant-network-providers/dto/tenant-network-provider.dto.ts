import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const NetworkProviderTypeEnum = z.enum(['CABLE_TV', 'ISP', 'IPTV', 'OTHERS']);
const NetworkProviderStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantNetworkProviderSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  type: NetworkProviderTypeEnum,
  name: z.string().min(1).max(150),
  email: z.string().email().max(150).optional(),
  phone: z.string().max(20).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  description: z.string().max(255).optional(),
});

const UpdateTenantNetworkProviderSchema = CreateTenantNetworkProviderSchema.partial().extend({
  type: NetworkProviderTypeEnum,
  name: z.string().min(1).max(150),
  status: NetworkProviderStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantNetworkProviderDto extends createZodDto(
  CreateTenantNetworkProviderSchema,
) {}
export class UpdateTenantNetworkProviderDto extends createZodDto(
  UpdateTenantNetworkProviderSchema,
) {}
