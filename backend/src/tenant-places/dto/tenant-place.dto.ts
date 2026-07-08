import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PlaceStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantPlaceSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  placeName: z.string().min(1).max(100),
  remark: z.string().max(255).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(1).optional().default(100),
});

const UpdateTenantPlaceSchema = CreateTenantPlaceSchema.partial().extend({
  status: PlaceStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantPlaceDto extends createZodDto(CreateTenantPlaceSchema) {}
export class UpdateTenantPlaceDto extends createZodDto(UpdateTenantPlaceSchema) {}
