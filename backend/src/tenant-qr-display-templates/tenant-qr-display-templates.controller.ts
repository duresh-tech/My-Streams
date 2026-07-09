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
import { TenantQrDisplayTemplatesService } from './tenant-qr-display-templates.service';
import {
  CreateTenantQrDisplayTemplateDto,
  UpdateTenantQrDisplayTemplateDto,
} from './dto/tenant-qr-display-template.dto';
import { TenantQrDisplayTemplateListQueryDto } from './dto/tenant-qr-display-template-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TEMPLATE_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'QDT-MR8NZ6OO-C0CB',
  tenantBusinessId: null,
  templateName: 'Default Blue',
  backgroundImagePath: 'qr_display_templates/019f357c-d489-74a9-8490-1f82e745b199.jpg',
  logoOverridePath: null,
  primaryColor: '#1D4ED8',
  footerText: 'Scan to pay',
  isSystemDefault: true,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: null,
};

@ApiTags('System / QR Display Templates')
@ApiBearerAuth()
@Controller('system/qr-display-templates')
export class TenantQrDisplayTemplatesController {
  constructor(private readonly templatesService: TenantQrDisplayTemplatesService) {}

  @Post('upload')
  @RequirePermissions('qr-display-templates:update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
  })
  @ApiOperation({
    summary: 'Upload a background/logo image for a display template',
    description: 'Stores the image (max 5 MB) and returns its path; use it as backgroundImagePath/logoOverridePath.',
  })
  @ApiResponse({ status: 201, schema: { example: { path: 'qr_display_templates/019f357c-....jpg' } } })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.templatesService.uploadAsset(file);
  }

  @Get()
  @RequirePermissions('qr-display-templates:list')
  @ApiOperation({
    summary: 'List QR display templates',
    description:
      'Includes both system-wide presets (tenantBusinessId=null) and tenant-owned templates. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [TEMPLATE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@Query() query: TenantQrDisplayTemplateListQueryDto) {
    return this.templatesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('qr-display-templates:view')
  @ApiOperation({ summary: 'Get a QR display template by id' })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @RequirePermissions('qr-display-templates:create')
  @ApiOperation({
    summary: 'Create a QR display template',
    description: 'Omit tenantBusinessId to create a system-wide preset every tenant can select.',
  })
  @ApiResponse({ status: 201, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist, or isSystemDefault set on a tenant-scoped template.' })
  create(@Body() dto: CreateTenantQrDisplayTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('qr-display-templates:update')
  @ApiOperation({ summary: 'Update a QR display template' })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantQrDisplayTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('qr-display-templates:delete')
  @ApiOperation({
    summary: 'Soft-delete a QR display template',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('qr-display-templates:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted QR display template',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Template not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.templatesService.restore(id);
  }
}
