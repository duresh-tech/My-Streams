import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { sanitizeEventTypes } from '../stream-events.logic';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');
const IdList = z.array(z.string().uuid()).max(500);
const Events = z
  .array(z.string().max(40))
  .max(30)
  .transform((events) => sanitizeEventTypes(events));

const AlertRuleFields = z.object({
  name: z.string().trim().min(1).max(150),
  /** Any number of events; a rule with none never fires. */
  events: Events.default([]),
  /** Scope lists: empty means all. */
  serverIds: IdList.default([]),
  streamIds: IdList.default([]),
  customerIds: IdList.default([]),
  recipients: z.array(z.string().trim().email().max(254)).max(50).default([]),
  /**
   * Customers emailed besides the recipients, by Bcc: none, the stream's owner,
   * or the owner plus every customer actively assigned to the stream's server.
   */
  customerRecipients: z.enum(['NONE', 'STREAM_OWNER', 'SERVER_CUSTOMERS']).default('NONE'),
  /** Minimum minutes between emails from this rule for the same stream; 0 = no cooldown. */
  cooldownMinutes: z.coerce.number().int().min(0).max(10080).default(15),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const CreateAlertRuleSchema = AlertRuleFields.refine(
  (rule) => rule.recipients.length > 0 || rule.customerRecipients !== 'NONE',
  { message: 'Add at least one recipient, or choose customers to email', path: ['recipients'] },
);

const AlertRuleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const StreamEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Matches the media (stream) name. */
  search: z.string().max(100).optional(),
  tenantFlussonicServerId: z.string().uuid().optional(),
  tenantStreamId: z.string().uuid().optional(),
  event: z.string().max(40).optional(),
  emailStatus: z.enum(['NOT_MATCHED', 'SENT', 'COOLDOWN', 'FAILED', 'NO_MAIL_CONFIG']).optional(),
  /** Inclusive calendar dates in the app timezone. */
  from: DateString.optional(),
  to: DateString.optional(),
});

export class CreateEventAlertRuleDto extends createZodDto(CreateAlertRuleSchema) {}
export class UpdateEventAlertRuleDto extends createZodDto(AlertRuleFields.partial()) {}
export class EventAlertRuleListQueryDto extends createZodDto(AlertRuleListQuerySchema) {}
export class StreamEventListQueryDto extends createZodDto(StreamEventListQuerySchema) {}
