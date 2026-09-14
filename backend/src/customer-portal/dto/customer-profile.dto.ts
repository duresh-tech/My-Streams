import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GenderEnum = z.enum(['MALE', 'FEMALE', 'TRANSGENDER', 'NOT_TO_SAY', 'NONE']);

/**
 * What a customer may change about themselves.
 *
 * Deliberately narrower than the tenant-side customer DTO. Absent here, and so
 * not editable by the customer at all rather than silently dropped:
 *
 * - first name, mobile number, email, customer type - identity and contact
 *   details the tenant bills and contacts against;
 * - city, state and country - derived from the place the tenant maintains;
 * - notification, portal-access, status and remark fields - the tenant's
 *   commercial settings;
 * - the picture, which has its own upload endpoint because it is a file.
 *
 * Clearable fields use `.nullish()` and are written as null when null arrives:
 * `undefined` is dropped from the body and read as "leave unchanged", so
 * without this a customer could never blank a field they had filled in.
 */
const UpdateCustomerProfileSchema = z.object({
  lName: z.string().max(100).nullish(),
  fatherName: z.string().max(150).nullish(),
  gender: GenderEnum.optional(),
  // Date only. A birthday in the future, or implying an age over ~120, is a
  // typo rather than a value worth storing.
  dateOfBirth: z.coerce
    .date()
    .refine((value) => value.getTime() <= Date.now(), 'The date of birth cannot be in the future')
    .refine(
      (value) => value.getTime() >= Date.now() - 120 * 365.25 * 24 * 3600 * 1000,
      'Please check the date of birth',
    )
    .nullish(),
  secondaryMobile: z.string().max(20).nullish(),
  place: z.string().trim().max(150).nullish(),
  street: z.string().trim().max(150).nullish(),
  addressLine1: z.string().min(1).max(255).optional(),
  addressLine2: z.string().max(255).nullish(),
  pincode: z.string().max(15).nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  idProofType: z.string().max(50).nullish(),
  idProofNumber: z.string().max(100).nullish(),
  taxType: z.string().max(50).nullish(),
  taxNumber: z.string().max(100).nullish(),
});

/**
 * Sign-in details, changed on their own.
 *
 * The current password is required even though the caller is already signed in:
 * it is what stops a borrowed or stolen session from locking the real customer
 * out of their own account. Either field may be changed alone.
 */
const UpdateCustomerCredentialsSchema = z
  .object({
    currentPassword: z.string().min(1).max(100),
    username: z.string().min(3).max(50).optional(),
    newPassword: z.string().min(8).max(100).optional(),
  })
  .refine(
    (value) => value.username !== undefined || value.newPassword !== undefined,
    'Provide a new username, a new password, or both',
  );

export class UpdateCustomerProfileDto extends createZodDto(UpdateCustomerProfileSchema) {}
export class UpdateCustomerCredentialsDto extends createZodDto(UpdateCustomerCredentialsSchema) {}
