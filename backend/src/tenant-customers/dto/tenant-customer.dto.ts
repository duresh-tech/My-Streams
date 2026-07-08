import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GenderEnum = z.enum(['MALE', 'FEMALE', 'TRANSGENDER', 'NOT_TO_SAY', 'NONE']);
const CustomerTypeEnum = z.enum(['INDIVIDUAL', 'BUSINESS']);
const CustomerStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

export const CreateTenantCustomerSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  customerCode: z.string().min(1).max(30),
  fName: z.string().min(1).max(100),
  lName: z.string().max(100).optional(),
  fatherName: z.string().max(150).optional(),
  gender: GenderEnum.default('NONE'),
  dateOfBirth: z.coerce.date().optional(),
  primaryMobile: z.string().min(1).max(20),
  secondaryMobile: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  customerType: CustomerTypeEnum.default('INDIVIDUAL'),
  tenantPlaceId: z.string().uuid().optional(),
  tenantStreetId: z.string().uuid().optional(),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  pincode: z.string().max(15).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  customerPicture: z.string().max(500).optional(),
  idProofType: z.string().max(50).optional(),
  idProofNumber: z.string().max(100).optional(),
  idProofFile: z.string().max(500).optional(),
  taxType: z.string().max(50).optional(),
  taxNumber: z.string().max(100).optional(),
  notifyViaSMS: z.coerce.boolean().default(true),
  notifyViaWhatsApp: z.coerce.boolean().default(true),
  notifyViaRCS: z.coerce.boolean().default(false),
  allowPortalAccess: z.coerce.boolean().default(true),
  remark: z.string().max(2000).optional(),
});

const UpdateTenantCustomerSchema = CreateTenantCustomerSchema.partial().extend({
  status: CustomerStatusEnum.exclude(['DELETED']).optional(),
});

const ChangeTenantCustomerStatusSchema = z.object({
  status: CustomerStatusEnum.exclude(['DELETED']),
});

export class CreateTenantCustomerDto extends createZodDto(CreateTenantCustomerSchema) {}
export class UpdateTenantCustomerDto extends createZodDto(UpdateTenantCustomerSchema) {}
export class ChangeTenantCustomerStatusDto extends createZodDto(ChangeTenantCustomerStatusSchema) {}
