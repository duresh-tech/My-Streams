import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateAppSettingsSchema = z.object({
  appName: z.string().min(1).max(100),
  logoPath: z.string().max(255).optional(),
});

export class UpdateAppSettingsDto extends createZodDto(UpdateAppSettingsSchema) {}
