import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CalculationTypeEnum = z.enum(['PERCENTAGE', 'FIXED']);
const TaxTypeStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantTaxTypeSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  taxName: z.string().min(1).max(100),
  calculationType: CalculationTypeEnum,
  value: z.coerce.number().min(0).max(999999.99),
  description: z.string().max(255).optional(),
});

const UpdateTenantTaxTypeSchema = CreateTenantTaxTypeSchema.partial().extend({
  status: TaxTypeStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantTaxTypeDto extends createZodDto(CreateTenantTaxTypeSchema) {}
export class UpdateTenantTaxTypeDto extends createZodDto(UpdateTenantTaxTypeSchema) {}
