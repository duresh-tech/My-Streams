import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CollectionModeEnum = z.enum(['MANUAL', 'AUTOMATIC']);

// Payment fields are split into their own gated DTO/endpoint (manage_payment_config
// permission) rather than the general update DTO, so device metadata edits (name,
// counter assignment, template) never require payment-sensitive access.
const PaymentConfigSchema = z
  .object({
    upiVpa: z.string().min(1).max(150).optional(),
    collectionMode: CollectionModeEnum.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.collectionMode === 'AUTOMATIC') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Automatic collection mode requires a payment gateway integration that is not yet available (Phase 2)',
        path: ['collectionMode'],
      });
    }
  });

export class TenantQrDevicePaymentConfigDto extends createZodDto(PaymentConfigSchema) {}
