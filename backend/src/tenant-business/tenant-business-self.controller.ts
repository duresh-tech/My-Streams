import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantBusinessService } from './tenant-business.service';
import { UpdateTenantBusinessInfoDto } from './dto/tenant-business.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_BUSINESS_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'TNB-MR8NZ6OO-C0CB',
  name: 'Acme Retail Pvt Ltd',
  tagLine: 'Quality you can trust',
  email: 'contact@acmeretail.com',
  phone: '+91-9876543210',
  country: 'India',
  countryCode: 'IN',
  state: 'Karnataka',
  city: 'Bengaluru',
  pincode: '560001',
  addressLine1: '221B Commerce Street',
  addressLine2: 'Suite 4',
  logoPath: 'tenant-business-logos/019f357c-d489-74a9-8490-1f82e745b199.jpg',
  taxNumber: '29ABCDE1234F1Z5',
  isParentBusiness: true,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
};

@ApiTags('Tenant / Business Information')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/business')
export class TenantBusinessSelfController {
  constructor(private readonly tenantBusinessService: TenantBusinessService) {}

  @Get()
  @RequireTenantPermissions('tenant-business:view')
  @ApiOperation({
    summary: "Get the authenticated tenant user's own business",
    description: 'Resolves the caller\'s single actively-mapped business.',
  })
  @ApiResponse({
    status: 200,
    description: 'Own business detail.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'No business mapped to this account.' })
  me(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantBusinessService.findMine(user.id);
  }

  @Patch()
  @RequireTenantPermissions('tenant-business:update')
  @ApiOperation({
    summary: 'Update own business information',
    description:
      'Self-service update of name, contact and address details. ' +
      'isParentBusiness and status cannot be changed here.',
  })
  @ApiResponse({
    status: 200,
    description: 'Business updated.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'No business mapped to this account.' })
  update(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: UpdateTenantBusinessInfoDto) {
    return this.tenantBusinessService.updateMine(user.id, dto);
  }

  @Post('logo')
  @RequireTenantPermissions('tenant-business:update')
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
    summary: 'Upload own business logo',
    description:
      'Stores the image (max 5 MB) via the configured storage driver, replaces ' +
      'any previous logo, and sets logoPath on the business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Logo stored; path returned.',
    schema: { example: { path: 'tenant-business-logos/019f357c-d489-74a9-8490-1f82e745b199.jpg' } },
  })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  uploadLogo(@CurrentTenantUser() user: TenantAuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.tenantBusinessService.updateMyLogo(user.id, file);
  }
}
