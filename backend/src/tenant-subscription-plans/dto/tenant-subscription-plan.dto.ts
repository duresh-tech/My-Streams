import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PLAY_PROTOCOLS } from '../../tenant-streams/stream-protocols';

const SubscriptionForEnum = z.enum(['STREAM', 'SERVER']);
const DurationUnitEnum = z.enum(['DAY', 'MONTH', 'YEAR']);
const PlanStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'DELETED']);

/** Money: two decimals, non-negative, and accepted as a string or a number. */
const Price = z.coerce.number().min(0).max(99999999.99).multipleOf(0.01);

const CreateTenantSubscriptionPlanSchema = z
  .object({
    tenantBusinessId: z.string().uuid(),
    name: z.string().min(1).max(150),
    description: z.string().max(5000).nullish(),

    subscriptionFor: SubscriptionForEnum,

    // Null means unlimited, which is why these are nullish rather than
    // defaulted to 0 - a plan with "0 streams" is not the same as "no cap".
    maxStreams: z.coerce.number().int().min(0).nullish(),
    maxPlaySession: z.coerce.number().int().min(0).nullish(),
    maxServerStream: z.coerce.number().int().min(0).nullish(),

    features: z.array(z.string().min(1).max(200)).max(50).nullish(),
    // Validated against the same protocol list the streams module uses, so a
    // plan cannot promise a protocol the server has no concept of.
    playbackProtocols: z.array(z.enum(PLAY_PROTOCOLS)).max(PLAY_PROTOCOLS.length).nullish(),

    durationValue: z.coerce.number().int().min(1).max(3650),
    durationUnit: DurationUnitEnum,

    orginalPrice: Price,
    customerPrice: Price,
    resellerPrice: Price,

    showCustomer: z.boolean().default(true),
    showReseller: z.boolean().default(false),
  })
  .superRefine((plan, ctx) => {
    // A STREAM plan capping server streams, or a SERVER plan capping streams,
    // is almost certainly a mistake and would silently never be enforced.
    if (plan.subscriptionFor === 'STREAM' && plan.maxServerStream != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxServerStream'],
        message: 'maxServerStream applies to SERVER plans only',
      });
    }
    if (plan.subscriptionFor === 'SERVER' && plan.maxStreams != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxStreams'],
        message: 'maxStreams applies to STREAM plans only',
      });
    }
  });

/**
 * `.partial()` cannot be called on a refined schema, so the update shape is
 * built from the same field definitions.
 *
 * `subscriptionFor` is deliberately absent: the limits are type-specific
 * (maxStreams for STREAM, maxServerStream for SERVER), so flipping the type
 * would leave the wrong limit populated and the right one empty, and anything
 * already sold on the plan would quietly change meaning. Changing the type
 * means creating a new plan.
 */
const UpdateTenantSubscriptionPlanSchema = z.object({
  tenantBusinessId: z.string().uuid().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(5000).nullish(),

  maxStreams: z.coerce.number().int().min(0).nullish(),
  maxPlaySession: z.coerce.number().int().min(0).nullish(),
  maxServerStream: z.coerce.number().int().min(0).nullish(),

  features: z.array(z.string().min(1).max(200)).max(50).nullish(),
  playbackProtocols: z.array(z.enum(PLAY_PROTOCOLS)).max(PLAY_PROTOCOLS.length).nullish(),

  durationValue: z.coerce.number().int().min(1).max(3650).optional(),
  durationUnit: DurationUnitEnum.optional(),

  orginalPrice: Price.optional(),
  customerPrice: Price.optional(),
  resellerPrice: Price.optional(),

  showCustomer: z.boolean().optional(),
  showReseller: z.boolean().optional(),

  status: PlanStatusEnum.exclude(['DELETED']).optional(),
});

/** Tenant portal: the business comes from the caller, never the body. */
const CreateTenantSubscriptionPlanSelfSchema = z
  .object(CreateTenantSubscriptionPlanSchema._def.schema.shape)
  .omit({ tenantBusinessId: true });

const UpdateTenantSubscriptionPlanSelfSchema = UpdateTenantSubscriptionPlanSchema.omit({
  tenantBusinessId: true,
});

export class CreateTenantSubscriptionPlanDto extends createZodDto(
  CreateTenantSubscriptionPlanSchema,
) {}
export class UpdateTenantSubscriptionPlanDto extends createZodDto(
  UpdateTenantSubscriptionPlanSchema,
) {}
export class CreateTenantSubscriptionPlanSelfDto extends createZodDto(
  CreateTenantSubscriptionPlanSelfSchema,
) {}
export class UpdateTenantSubscriptionPlanSelfDto extends createZodDto(
  UpdateTenantSubscriptionPlanSelfSchema,
) {}
