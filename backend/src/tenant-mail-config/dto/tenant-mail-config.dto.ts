import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MailDriverEnum = z.enum(['SMTP']);
const MailEncryptionEnum = z.enum(['NONE', 'SSL', 'TLS', 'SMTP', 'SMTPS']);

const CreateTenantMailConfigSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  mailDriver: MailDriverEnum.default('SMTP'),
  mailHost: z.string().max(255).optional(),
  mailPort: z.coerce.number().int().min(1).max(65535).optional(),
  mailUsername: z.string().max(150).optional(),
  mailPassword: z.string().max(255).optional(),
  mailEncryption: MailEncryptionEnum.default('NONE'),
  fromMailAddress: z.string().email().max(150).optional(),
  fromMailName: z.string().max(150).optional(),
});

const UpdateTenantMailConfigSchema = CreateTenantMailConfigSchema.partial();

export class CreateTenantMailConfigDto extends createZodDto(CreateTenantMailConfigSchema) {}
export class UpdateTenantMailConfigDto extends createZodDto(UpdateTenantMailConfigSchema) {}
