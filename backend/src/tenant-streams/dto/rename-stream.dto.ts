import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * A rename recreates the stream on the server under the new name and removes
 * the old one, so it is a separate operation from an ordinary update.
 */
const RenameStreamSchema = z.object({
  applicationName: z
    .string()
    .max(150)
    .regex(
      /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/,
      'Letters, digits, dot, underscore, hyphen, and / between segments',
    )
    .optional(),
  streamKey: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, 'Only letters, digits, dot, underscore and hyphen'),
});

export class RenameStreamDto extends createZodDto(RenameStreamSchema) {}
