import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TemplateStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantQrDisplayTemplateSchema = z.object({
  // Omitted (system controller only) = a system-wide preset every tenant can pick from.
  tenantBusinessId: z.string().uuid().optional(),
  templateName: z.string().min(1).max(100),
  backgroundImagePath: z.string().max(255).optional(),
  logoOverridePath: z.string().max(255).optional(),
  primaryColor: z.string().max(20).optional(),
  footerText: z.string().max(255).optional(),
  isSystemDefault: z.boolean().optional().default(false),
});

const UpdateTenantQrDisplayTemplateSchema = CreateTenantQrDisplayTemplateSchema.omit({
  tenantBusinessId: true,
})
  .partial()
  .extend({
    status: TemplateStatusEnum.exclude(['DELETED']).optional(),
  });

export class CreateTenantQrDisplayTemplateDto extends createZodDto(CreateTenantQrDisplayTemplateSchema) {}
export class UpdateTenantQrDisplayTemplateDto extends createZodDto(UpdateTenantQrDisplayTemplateSchema) {}
