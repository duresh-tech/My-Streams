import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { sanitizeEventTypes } from '../../tenant-stream-events/stream-events.logic';

/**
 * The API surface is deliberately vendor-neutral (apiUsername, serverVersion,
 * ...) even though the underlying columns are Flussonic-specific - the client
 * apps must not carry the vendor name. The service maps between the two.
 */
const FlussonicServerStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
  'BLOCKED',
  'TERMINATED',
  'DELETED',
]);

const CreateTenantFlussonicServerSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  name: z.string().min(1).max(150),
  hostName: z.string().min(1).max(255),
  hostPort: z.coerce.number().int().min(1).max(65535).default(80),
  domain: z.string().max(255).optional(),
  useSSL: z.boolean().default(true),
  apiUsername: z.string().max(150).optional(),
  // Plaintext on the way in; stored AES-256-GCM encrypted and never returned.
  apiPassword: z.string().max(255).optional(),
  apiBasePath: z.string().min(1).max(255).default('/streamer/api/v3'),
  apiAccessToken: z.string().max(255).optional(),
  apiVersionTag: z.string().max(50).optional(),
  // Protocol listener ports as configured on the streamer itself.
  httpPort: z.coerce.number().int().min(1).max(65535).default(80),
  httpsPort: z.coerce.number().int().min(1).max(65535).default(443),
  rtmpPort: z.coerce.number().int().min(1).max(65535).default(1935),
  rtmpsPort: z.coerce.number().int().min(1).max(65535).default(443),
  rtspPort: z.coerce.number().int().min(1).max(65535).default(554),
  rtspsPort: z.coerce.number().int().min(1).max(65535).default(322),
  srtPort: z.coerce.number().int().min(1).max(65535).default(9710),
  serverVersion: z.string().max(50).optional(),
  remark: z.string().max(2000).optional(),
  // Stream events the server posts to this app. Unknown names are dropped.
  eventsEnabled: z.boolean().default(false),
  eventTypes: z
    .array(z.string().max(40))
    .max(30)
    .transform((types) => sanitizeEventTypes(types))
    .optional(),
});

const UpdateTenantFlussonicServerSchema = CreateTenantFlussonicServerSchema.partial().extend({
  status: FlussonicServerStatusEnum.exclude(['DELETED']).optional(),
});

/**
 * Tenant-portal variants. A tenant user is mapped to exactly one business
 * (TenantMappedBusiness is unique per user), so the portal never asks for it -
 * the service resolves it from the caller and tenant users cannot move a
 * server to another business.
 */
const CreateTenantFlussonicServerSelfSchema = CreateTenantFlussonicServerSchema.omit({
  tenantBusinessId: true,
});

const UpdateTenantFlussonicServerSelfSchema = UpdateTenantFlussonicServerSchema.omit({
  tenantBusinessId: true,
});

export class CreateTenantFlussonicServerDto extends createZodDto(
  CreateTenantFlussonicServerSchema,
) {}
export class UpdateTenantFlussonicServerDto extends createZodDto(
  UpdateTenantFlussonicServerSchema,
) {}
export class CreateTenantFlussonicServerSelfDto extends createZodDto(
  CreateTenantFlussonicServerSelfSchema,
) {}
export class UpdateTenantFlussonicServerSelfDto extends createZodDto(
  UpdateTenantFlussonicServerSelfSchema,
) {}
