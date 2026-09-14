import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CustomerLoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100),
});

const CustomerRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export class CustomerLoginDto extends createZodDto(CustomerLoginSchema) {}
export class CustomerRefreshDto extends createZodDto(CustomerRefreshSchema) {}
