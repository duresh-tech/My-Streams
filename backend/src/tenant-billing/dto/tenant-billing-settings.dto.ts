import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));

/** How often the billing job may run for a business, in minutes: 1 minute to 24 hours. */
export const LIFECYCLE_INTERVAL_PRESETS = [1, 5, 10, 15, 30, 60, 360, 720, 1440];

const UpdateTenantBillingSettingsSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter uppercase ISO 4217 code')
    .refine((code) => CURRENCY_CODES.has(code), 'Unknown ISO 4217 currency code')
    .optional(),
  // Printed in front of every invoice number, so limited to characters that are
  // safe in a file name and unambiguous on paper.
  invoicePrefix: z
    .string()
    .max(20)
    .regex(/^[A-Za-z0-9/_-]*$/, 'Prefix may contain letters, digits, "-", "_" and "/" only')
    .optional(),
  // Refused by the service once an invoice has been issued - see there.
  nextInvoiceNumber: z.coerce.number().int().min(1).max(999999999).optional(),
  invoiceDueDays: z.coerce.number().int().min(0).max(365).optional(),
  renewalLeadDays: z.coerce.number().int().min(0).max(90).optional(),
  graceDays: z.coerce.number().int().min(0).max(90).optional(),
  activateOn: z.enum(['PAYMENT', 'ISSUE']).optional(),
  defaultTaxTypeId: z.string().uuid().nullish(),
  invoiceFooter: z.string().max(2000).nullish(),
  lifecycleIntervalMinutes: z.coerce
    .number()
    .int()
    .refine(
      (minutes) => LIFECYCLE_INTERVAL_PRESETS.includes(minutes),
      `Interval must be one of ${LIFECYCLE_INTERVAL_PRESETS.join(', ')} minutes`,
    )
    .optional(),
  /** Stops scheduled runs; "Run now", payments and cancels still apply. */
  lifecyclePaused: z.boolean().optional(),
});

export class UpdateTenantBillingSettingsDto extends createZodDto(
  UpdateTenantBillingSettingsSchema,
) {}
