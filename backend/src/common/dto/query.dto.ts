import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export class ListQueryDto extends createZodDto(ListQuerySchema) {}

export function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

export function listResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
