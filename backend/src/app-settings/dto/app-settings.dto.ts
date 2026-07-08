import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AppSettingDataTypeEnum = z.enum([
  'STRING',
  'TEXT',
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'JSON',
  'DATE',
  'DATETIME',
  'TIME',
  'FILE',
]);
const AppSettingStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'DELETED']);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

/** Shared by the create DTO's refinement and the service's update path (which
 * must validate against the row's existing, immutable dataType). */
export function validateValueForDataType(
  dataType: z.infer<typeof AppSettingDataTypeEnum>,
  value: string,
): string | null {
  switch (dataType) {
    case 'INTEGER':
      return /^-?\d+$/.test(value) ? null : 'value must be an integer';
    case 'DECIMAL':
      return value !== '' && !Number.isNaN(Number(value)) ? null : 'value must be a decimal number';
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'value must be "true" or "false"';
    case 'JSON':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'value must be valid JSON';
      }
    case 'DATE':
      return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : 'value must be a date in YYYY-MM-DD format';
    case 'DATETIME':
      return !Number.isNaN(Date.parse(value)) ? null : 'value must be a valid ISO datetime';
    case 'TIME':
      return TIME_PATTERN.test(value) ? null : 'value must be a time in HH:mm or HH:mm:ss format';
    case 'STRING':
    case 'TEXT':
    case 'FILE':
    default:
      return null;
  }
}

const CreateAppSettingSchema = z
  .object({
    key: z.string().min(1).max(150),
    dataType: AppSettingDataTypeEnum,
    value: z.string().min(1),
    description: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const error = validateValueForDataType(data.dataType, data.value);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['value'] });
  });

const UpdateAppSettingSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().max(255).optional(),
  status: AppSettingStatusEnum.exclude(['DELETED']).optional(),
});

export class CreateAppSettingDto extends createZodDto(CreateAppSettingSchema) {}
export class UpdateAppSettingDto extends createZodDto(UpdateAppSettingSchema) {}
