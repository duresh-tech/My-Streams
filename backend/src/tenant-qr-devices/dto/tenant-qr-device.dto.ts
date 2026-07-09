import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DeviceModelEnum = z.enum(['BONRIX_DQ12', 'GENERIC']);
const DeviceStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const CreateTenantQrDeviceSchema = z.object({
  tenantBusinessId: z.string().uuid(),
  tenantPlaceId: z.string().uuid().optional(),
  tenantCounterId: z.string().uuid().optional(),
  displayTemplateId: z.string().uuid().optional(),
  deviceCode: z.string().min(1).max(30),
  deviceName: z.string().min(1).max(100),
  deviceModel: DeviceModelEnum.optional().default('BONRIX_DQ12'),
});

const UpdateTenantQrDeviceSchema = CreateTenantQrDeviceSchema.partial().extend({
  status: DeviceStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateTenantQrDeviceDto extends createZodDto(CreateTenantQrDeviceSchema) {}
export class UpdateTenantQrDeviceDto extends createZodDto(UpdateTenantQrDeviceSchema) {}
