import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PaymentModeStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantPaymentModeSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  paymentName: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

const UpdateTenantPaymentModeSchema = CreateTenantPaymentModeSchema.partial().extend({
  status: PaymentModeStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantPaymentModeDto extends createZodDto(CreateTenantPaymentModeSchema) {}
export class UpdateTenantPaymentModeDto extends createZodDto(UpdateTenantPaymentModeSchema) {}
