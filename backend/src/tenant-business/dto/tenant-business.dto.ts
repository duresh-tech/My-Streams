import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TenantBusinessStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantBusinessSchema = z.object({
  name: z.string().min(1).max(150),
  tagLine: z.string().max(200).optional(),
  email: z.string().email().max(150),
  phone: z.string().min(5).max(20),
  country: z.string().min(1).max(100),
  countryCode: z.string().min(1).max(10),
  state: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  pincode: z.string().min(1).max(20),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  logoPath: z.string().max(255).optional(),
  taxNumber: z.string().max(50).optional(),
  isParentBusiness: z.boolean().default(false),
});

const UpdateTenantBusinessSchema = CreateTenantBusinessSchema.partial().extend({
  status: TenantBusinessStatusEnum.exclude(['DELETED']).optional(),
});

// Tenant self-service: excludes isParentBusiness and status, both of which
// stay system-admin-only structural/administrative flags.
const UpdateTenantBusinessInfoSchema = z.object({
  name: z.string().min(1).max(150),
  tagLine: z.string().max(200).optional(),
  email: z.string().email().max(150),
  phone: z.string().min(5).max(20),
  country: z.string().min(1).max(100),
  countryCode: z.string().min(1).max(10),
  state: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  pincode: z.string().min(1).max(20),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  logoPath: z.string().max(255).optional(),
  taxNumber: z.string().max(50).optional(),
});

export class CreateTenantBusinessDto extends createZodDto(CreateTenantBusinessSchema) {}
export class UpdateTenantBusinessDto extends createZodDto(UpdateTenantBusinessSchema) {}
export class UpdateTenantBusinessInfoDto extends createZodDto(UpdateTenantBusinessInfoSchema) {}
