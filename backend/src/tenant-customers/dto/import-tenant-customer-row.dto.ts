import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GenderEnum = z.enum(['MALE', 'FEMALE', 'TRANSGENDER', 'NOT_TO_SAY', 'NONE']);
const CustomerTypeEnum = z.enum(['INDIVIDUAL', 'BUSINESS']);

/** CSV cells are always strings (or missing) - blank out empty strings before the real schema runs. */
function blankToUndefined(val: unknown) {
  return typeof val === 'string' && val.trim() === '' ? undefined : val;
}

function csvBoolean(defaultValue: boolean) {
  return z.preprocess((val) => {
    const v = blankToUndefined(val);
    if (v === undefined) return defaultValue;
    if (typeof v === 'boolean') return v;
    return ['true', '1', 'yes', 'y'].includes(String(v).trim().toLowerCase());
  }, z.boolean());
}

export const ImportTenantCustomerRowSchema = z.object({
  tenantBusinessId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  fName: z.preprocess(blankToUndefined, z.string().min(1).max(100)),
  lName: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  fatherName: z.preprocess(blankToUndefined, z.string().max(150).optional()),
  gender: z.preprocess(blankToUndefined, GenderEnum.default('NONE')),
  dateOfBirth: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  primaryMobile: z.preprocess(blankToUndefined, z.string().min(1).max(20)),
  secondaryMobile: z.preprocess(blankToUndefined, z.string().max(20).optional()),
  email: z.preprocess(blankToUndefined, z.string().email().max(255).optional()),
  customerType: z.preprocess(blankToUndefined, CustomerTypeEnum.default('INDIVIDUAL')),
  place: z.preprocess(blankToUndefined, z.string().trim().max(150).optional()),
  street: z.preprocess(blankToUndefined, z.string().trim().max(150).optional()),
  addressLine1: z.preprocess(blankToUndefined, z.string().min(1).max(255)),
  addressLine2: z.preprocess(blankToUndefined, z.string().max(255).optional()),
  city: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  state: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  country: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  pincode: z.preprocess(blankToUndefined, z.string().max(15).optional()),
  latitude: z.preprocess(blankToUndefined, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(blankToUndefined, z.coerce.number().min(-180).max(180).optional()),
  customerPicture: z.preprocess(blankToUndefined, z.string().max(500).optional()),
  idProofType: z.preprocess(blankToUndefined, z.string().max(50).optional()),
  idProofNumber: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  idProofFile: z.preprocess(blankToUndefined, z.string().max(500).optional()),
  taxType: z.preprocess(blankToUndefined, z.string().max(50).optional()),
  taxNumber: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  notifyViaSMS: csvBoolean(true),
  notifyViaWhatsApp: csvBoolean(true),
  notifyViaRCS: csvBoolean(false),
  allowPortalAccess: csvBoolean(true),
  remark: z.preprocess(blankToUndefined, z.string().max(2000).optional()),
});

export class ImportTenantCustomerRowDto extends createZodDto(ImportTenantCustomerRowSchema) {}
