import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MappedBusinessStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateMappedBusinessSchema = z.object({
  tenantUserId: z.string().uuid(),
  tenantBusinessId: z.string().uuid(),
});

const UpdateMappedBusinessSchema = z.object({
  tenantUserId: z.string().uuid(),
  tenantBusinessId: z.string().uuid(),
  status: MappedBusinessStatusEnum.exclude(['DELETED']).optional(),
});

const ChangeMappedBusinessStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
});

export class CreateMappedBusinessDto extends createZodDto(CreateMappedBusinessSchema) {}
export class UpdateMappedBusinessDto extends createZodDto(UpdateMappedBusinessSchema) {}
export class ChangeMappedBusinessStatusDto extends createZodDto(ChangeMappedBusinessStatusSchema) {}
