import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DASHBOARD_RANGES } from '../utils/dashboard-buckets';

const DashboardRangeQuerySchema = z.object({
  /** 30 days (daily), 90 days (weekly) or 12 months (monthly). */
  range: z.enum(DASHBOARD_RANGES).default('30d'),
});

export class DashboardRangeQueryDto extends createZodDto(DashboardRangeQuerySchema) {}
