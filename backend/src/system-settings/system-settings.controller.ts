import {
  Body,
  Controller,
  Get,
  Patch,
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
import { SystemSettingsService } from './system-settings.service';
import { UpdateAppSettingsDto } from './dto/system-settings.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const APP_SETTINGS_EXAMPLE = {
  id: 'default',
  appName: 'Acme Cloud',
  logoPath: 'app-settings/019f357c-d489-74a9-8490-1f82e745b199.jpg',
  createdAt: 1783308735,
  updatedAt: 1783308735,
};

@ApiTags('System / Settings')
@Controller('system/settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get application branding settings',
    description:
      'Public endpoint (no auth required) — used to render the app name/logo ' +
      'throughout the system dashboard and tenant settings UI.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current branding settings.',
    schema: { example: APP_SETTINGS_EXAMPLE },
  })
  get() {
    return this.systemSettingsService.get();
  }

  @Patch()
  @ApiBearerAuth()
  @RequirePermissions('system-settings:update')
  @ApiOperation({ summary: 'Update application branding settings (name)' })
  @ApiResponse({
    status: 200,
    description: 'Settings updated.',
    schema: { example: APP_SETTINGS_EXAMPLE },
  })
  update(@Body() dto: UpdateAppSettingsDto) {
    return this.systemSettingsService.update(dto);
  }

  @Post('logo')
  @ApiBearerAuth()
  @RequirePermissions('system-settings:update')
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
    summary: 'Upload the application logo',
    description:
      'Stores the image (max 5 MB) via the configured storage driver, replaces ' +
      'any previous logo, and sets logoPath on the settings.',
  })
  @ApiResponse({
    status: 201,
    description: 'Logo stored; path returned.',
    schema: { example: { path: 'app-settings/019f357c-d489-74a9-8490-1f82e745b199.jpg' } },
  })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    return this.systemSettingsService.updateLogo(file);
  }
}
