import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StreamProtocolsSchema } from '../../tenant-streams/stream-protocols';

const StreamInputSchema = z.object({
  url: z.string().min(1).max(500),
  comment: z.string().max(255).optional(),
  sourceTimeout: z.coerce.number().int().min(1).max(86400).optional(),
});

/**
 * A customer creates a stream on a server assigned to them. The customer and
 * business are taken from the session, never the body, and the stream is always
 * attached to the caller.
 */
const CustomerCreateStreamSchema = z.object({
  serverId: z.string().uuid(),
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
  title: z.string().min(1).max(150),
  protocols: StreamProtocolsSchema.optional(),
  inputs: z.array(StreamInputSchema).max(20).default([]),
});

/**
 * Only the application name and the inputs. Everything else - title,
 * protocols, server, customer, limits - is a commercial setting the tenant
 * controls, so it is not accepted here at all rather than silently ignored.
 */
const CustomerUpdateStreamSchema = z.object({
  applicationName: z
    .string()
    .max(150)
    .regex(
      /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/,
      'Letters, digits, dot, underscore, hyphen, and / between segments',
    )
    .nullish(),
  inputs: z.array(StreamInputSchema).max(20).optional(),
});

export class CustomerCreateStreamDto extends createZodDto(CustomerCreateStreamSchema) {}
export class CustomerUpdateStreamDto extends createZodDto(CustomerUpdateStreamSchema) {}
