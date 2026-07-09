import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Reported by the tenant's browser after it talks to the physical device
// directly over Web Serial (the backend never touches the COM port itself -
// see the "Connect Device" flow on the QR devices page).
const SerialLogSchema = z.object({
  eventType: z.enum(['PUSH_REQUESTED', 'TEST_TRIGGERED', 'ERROR']),
  atCommand: z.string().max(2000),
  atResponse: z.string().max(2000).optional(),
  message: z.string().max(255).optional(),
});

export class TenantQrDeviceSerialLogDto extends createZodDto(SerialLogSchema) {}
