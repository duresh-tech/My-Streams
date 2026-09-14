import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { CreateAppSettingDto, UpdateAppSettingDto } from './dto/app-settings.dto';
import { AppSettingListQueryDto } from './dto/app-settings-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const APP_SETTING_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  key: 'app.name',
  dataType: 'STRING',
  value: 'FlowNet',
  description: 'Name of the application',
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
};

@ApiTags('System / App Settings')
@Controller('system/app-settings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get('public/branding')
  @Public()
  @ApiOperation({
    summary: 'Get application branding (name/logo) and timezone',
    description:
      'Public endpoint (no auth required) - returns branding in the stable ' +
      '{ appName, logoPath } shape used throughout the system dashboard and ' +
      'tenant settings UI, plus the timezone the backend runs in (APP_TIMEZONE) ' +
      'so clients render timestamps in the same zone instead of the viewer\'s.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current branding and timezone.',
    schema: {
      example: {
        appName: 'FlowNet',
        logoPath: 'app_settings_uploads/019f357c-d489-74a9-8490-1f82e745b199.jpg',
        timezone: 'Asia/Kolkata',
      },
    },
  })
  getBranding() {
    return this.appSettingsService.getBrandingPublic();
  }

  @Post('logo')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:update')
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
      'any previous logo, and upserts the app.logo_path setting value.',
  })
  @ApiResponse({
    status: 201,
    description: 'Logo stored; path returned.',
    schema: { example: { path: 'app_settings_uploads/019f357c-d489-74a9-8490-1f82e745b199.jpg' } },
  })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    return this.appSettingsService.uploadLogoValue(file);
  }

  @Post('upload')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:update')
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
    summary: 'Upload a file for a FILE-dataType setting',
    description:
      'Generic upload for any setting with dataType=FILE - stores the file ' +
      '(max 5 MB) into the app_settings_uploads folder and returns its path. ' +
      'Does not touch any setting row itself; use the returned path as the ' +
      'value when creating/updating the setting.',
  })
  @ApiResponse({
    status: 201,
    description: 'File stored; path returned.',
    schema: { example: { path: 'app_settings_uploads/019f357c-d489-74a9-8490-1f82e745b199.pdf' } },
  })
  @ApiResponse({ status: 400, description: 'Missing or oversized file.' })
  uploadValueFile(@UploadedFile() file?: Express.Multer.File) {
    return this.appSettingsService.uploadValueFile(file);
  }

  @Get('key/:key')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:view')
  @ApiOperation({ summary: 'Get an app setting by its key (e.g. "app.name")' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiResponse({ status: 200, schema: { example: APP_SETTING_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Setting not found.' })
  findByKey(@Param('key') key: string) {
    return this.appSettingsService.findByKey(key);
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermissions('app-settings:view')
  @ApiOperation({
    summary: 'List app settings',
    description: 'Paginated, searchable (key/description), filterable by status/dataType, sortable.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [APP_SETTING_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@Query() query: AppSettingListQueryDto) {
    return this.appSettingsService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:view')
  @ApiOperation({ summary: 'Get an app setting by id' })
  @ApiParam({ name: 'id', description: 'Setting UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: APP_SETTING_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Setting not found.' })
  findOne(@Param('id') id: string) {
    return this.appSettingsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('app-settings:create')
  @ApiOperation({
    summary: 'Create an app setting',
    description: 'key must be unique. value is validated against dataType (e.g. INTEGER must parse as an integer, JSON must be valid JSON).',
  })
  @ApiResponse({ status: 201, schema: { example: APP_SETTING_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Key already in use, or value does not match dataType.' })
  create(@Body() dto: CreateAppSettingDto) {
    return this.appSettingsService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:update')
  @ApiOperation({
    summary: 'Update an app setting',
    description: 'key and dataType are immutable after creation - only value/description/status can change.',
  })
  @ApiParam({ name: 'id', description: 'Setting UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: APP_SETTING_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'value does not match the setting\'s dataType.' })
  @ApiResponse({ status: 404, description: 'Setting not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateAppSettingDto) {
    return this.appSettingsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:delete')
  @ApiOperation({
    summary: 'Soft-delete an app setting',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Setting UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Setting not found.' })
  remove(@Param('id') id: string) {
    return this.appSettingsService.remove(id);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @RequirePermissions('app-settings:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted app setting',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Setting UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: APP_SETTING_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Setting not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.appSettingsService.restore(id);
  }
}
