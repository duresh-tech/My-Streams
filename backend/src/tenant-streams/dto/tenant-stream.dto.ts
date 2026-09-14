import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StreamProtocolsSchema } from '../stream-protocols';

const StreamStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

/**
 * Flussonic derives the input type from the URL scheme - there is no
 * discriminator field in `stream_input` - so the URL is the source of truth
 * and the UI offers presets that build one.
 */
const StreamInputSchema = z.object({
  url: z.string().min(1).max(500),
  comment: z.string().max(255).optional(),
  sourceTimeout: z.coerce.number().int().min(1).max(86400).optional(),
  timeout: z.coerce.number().int().min(1).max(86400).optional(),
  framesTimeout: z.coerce.number().int().min(1).max(86400).optional(),
  userAgent: z.string().max(255).optional(),
  maxBitrate: z.coerce.number().int().min(1).optional(),
});

/**
 * `name` is never accepted from the client - it is derived from
 * applicationName/streamKey by the service, the way customerCode is.
 */
const CreateTenantStreamSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  serverId: z.string().uuid(),
  tenantCustomerId: z.string().uuid().nullish(),
  // Optional, and may contain slashes: the prefix is a path on the server
  // (`live`, `app-restream`, even `a/b`). A bare stream has none.
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
  // nullish, not optional: omitted means "leave alone", null means "clear it".
  ingestDomain: z.string().max(255).nullish(),
  // TLS for this stream's own ingest domain; ignored when it has none.
  useSSL: z.boolean().default(false),
  comment: z.string().max(2000).nullish(),
  retryLimit: z.coerce.number().int().min(0).max(1000).nullish(),
  sourceTimeout: z.coerce.number().int().min(1).max(86400).nullish(),
  isStatic: z.boolean().default(true),
  disabled: z.boolean().default(false),
  protocols: StreamProtocolsSchema.optional(),
  // Order in the array is the failover order; priority is assigned from it.
  inputs: z.array(StreamInputSchema).max(20).default([]),
});

/**
 * applicationName and streamKey are absent on purpose: changing either renames
 * the stream, which deletes and recreates it on the server and disconnects
 * every viewer. That goes through the dedicated rename endpoint instead.
 */
const UpdateTenantStreamSchema = CreateTenantStreamSchema.omit({
  applicationName: true,
  streamKey: true,
})
  .partial()
  .extend({
    status: StreamStatusEnum.exclude(['DELETED']).optional(),
  });

/** Tenant portal: the business comes from the caller's mapping, never the body. */
const CreateTenantStreamSelfSchema = CreateTenantStreamSchema.omit({
  tenantBusinessId: true,
});

const UpdateTenantStreamSelfSchema = UpdateTenantStreamSchema.omit({
  tenantBusinessId: true,
});

export class CreateTenantStreamDto extends createZodDto(CreateTenantStreamSchema) {}
export class UpdateTenantStreamDto extends createZodDto(UpdateTenantStreamSchema) {}
export class CreateTenantStreamSelfDto extends createZodDto(CreateTenantStreamSelfSchema) {}
export class UpdateTenantStreamSelfDto extends createZodDto(UpdateTenantStreamSelfSchema) {}
