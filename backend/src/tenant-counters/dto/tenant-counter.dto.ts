import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CounterStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantCounterSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  tenantPlaceId: z.string().uuid().optional(),
  counterCode: z.string().min(1).max(30),
  counterName: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

const UpdateTenantCounterSchema = CreateTenantCounterSchema.partial().extend({
  status: CounterStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantCounterDto extends createZodDto(CreateTenantCounterSchema) {}
export class UpdateTenantCounterDto extends createZodDto(UpdateTenantCounterSchema) {}
