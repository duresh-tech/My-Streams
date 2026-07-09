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
  UseGuards,
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
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TEMPLATE_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'QDT-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  templateName: 'My Storefront Theme',
  backgroundImagePath: 'qr_display_templates/019f357c-d489-74a9-8490-1f82e745b199.jpg',
  logoOverridePath: null,
  primaryColor: '#1D4ED8',
  footerText: 'Scan to pay',
  isSystemDefault: false,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

@ApiTags('Tenant / QR Display Templates')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/qr-display-templates')
export class TenantQrDisplayTemplatesSelfController {
  constructor(private readonly templatesService: TenantQrDisplayTemplatesService) {}

  @Get('businesses')
  @RequireTenantPermissions('qr-display-templates:list')
  @ApiOperation({ summary: "List the caller's own mapped businesses" })
  @ApiResponse({
    status: 200,
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.templatesService.listMappedBusinesses(user.id);
  }

  @Post('upload')
  @RequireTenantPermissions('qr-display-templates:update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
  })
  @ApiOperation({
    summary: 'Upload a background/logo image for one of the caller\'s own templates',
    description: 'Stores the image (max 5 MB) and returns its path; use it as backgroundImagePath/logoOverridePath.',
  })
  @ApiResponse({ status: 201, schema: { example: { path: 'qr_display_templates/019f357c-....jpg' } } })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.templatesService.uploadAsset(file);
  }

  @Get()
  @RequireTenantPermissions('qr-display-templates:list')
  @ApiOperation({
    summary: "List templates the caller can use",
    description: 'System-wide presets plus templates owned by businesses the caller is mapped to.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { items: [TEMPLATE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantQrDisplayTemplateListQueryDto) {
    return this.templatesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('qr-display-templates:view')
  @ApiOperation({ summary: 'Get a template by id (system preset or one the caller owns)' })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.templatesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('qr-display-templates:create')
  @ApiOperation({
    summary: "Create a template for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to. Cannot create a system-wide default.',
  })
  @ApiResponse({ status: 201, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantQrDisplayTemplateDto) {
    return this.templatesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('qr-display-templates:update')
  @ApiOperation({ summary: "Update one of the caller's own templates" })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: TEMPLATE_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'Cannot modify a system-wide template.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantQrDisplayTemplateDto,
  ) {
    return this.templatesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('qr-display-templates:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own templates" })
  @ApiParam({ name: 'id', description: 'Template UUIDv7' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Cannot delete a system-wide template.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.templatesService.removeForTenantUser(user.id, id);
  }
}
