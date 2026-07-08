import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AppSettingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']).optional(),
  dataType: z
    .enum(['STRING', 'TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'JSON', 'DATE', 'DATETIME', 'TIME'])
    .optional(),
  sortBy: z.enum(['key', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class AppSettingListQueryDto extends createZodDto(AppSettingListQuerySchema) {}
