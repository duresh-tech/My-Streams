import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StorageService } from '../storage/storage.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('System / Uploads')
@ApiBearerAuth()
@Controller('system/uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @RequirePermissions('uploads:create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Upload a file',
    description:
      'Stores the file via the configured driver (STORAGE_DRIVER=local|s3) ' +
      'and returns only its storage PATH (never a URL). Max size 5 MB.',
  })
  @ApiResponse({
    status: 201,
    description: 'File stored; path returned.',
    schema: {
      example: { path: 'general/019f357c-d489-74a9-8490-1f82e745b199.jpg', driver: 'local' },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or oversized file.' })
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    const path = await this.storage.upload(file, 'general');
    return { path, driver: this.storage.activeDriver };
  }
}
