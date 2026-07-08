import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const StreetStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);
const StreetCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'streetCode must be exactly 3 uppercase letters (A-Z)');

const CreateTenantStreetSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  tenantPlaceId: z.string().uuid(),
  streetCode: StreetCodeSchema,
  streetName: z.string().min(1).max(100),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  remark: z.string().max(255).optional(),
});

const UpdateTenantStreetSchema = CreateTenantStreetSchema.partial().extend({
  status: StreetStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantStreetDto extends createZodDto(CreateTenantStreetSchema) {}
export class UpdateTenantStreetDto extends createZodDto(UpdateTenantStreetSchema) {}
