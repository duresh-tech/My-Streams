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
import { TenantAccountService } from './tenant-account.service';
import { UpdateTenantAccountDto } from './dto/tenant-account.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_ACCOUNT_EXAMPLE = {
  id: '019f37c9-c7d3-71df-8718-0c4e34a03426',
  systemCode: 'TNU-MR9AZVF7-8954',
  fName: 'John Doe',
  username: 'john.doe',
  email: 'john@example.com',
  phone: '+1 555 0100',
  avatarPath: 'tenant-avatars/019f37c9-c7d3-71df-8718-0c4e34a03426.jpg',
  roleId: '019f37c9-aaaa-71df-8718-0c4e34a03426',
  status: 'ACTIVE',
  createdAt: 1783305807,
  updatedAt: 1783305807,
  role: {
    id: '019f37c9-aaaa-71df-8718-0c4e34a03426',
    roleKey: 'TENANT_ADMIN',
    displayName: 'Tenant Administrator',
  },
};

@ApiTags('Tenant / Account')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/account')
export class TenantAccountController {
  constructor(private readonly tenantAccountService: TenantAccountService) {}

  @Get()
  @RequireTenantPermissions('tenant-account:view')
  @ApiOperation({
    summary: "Get the authenticated tenant user's own profile",
    description: 'Full self-service profile, including phone and avatarPath.',
  })
  @ApiResponse({
    status: 200,
    description: 'Own profile.',
    schema: { example: TENANT_ACCOUNT_EXAMPLE },
  })
  me(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantAccountService.findMe(user.id);
  }

  @Patch()
  @RequireTenantPermissions('tenant-account:update')
  @ApiOperation({
    summary: 'Update own profile',
    description:
      'Self-service update of fName, username, email, phone and/or password. ' +
      'roleId and status cannot be changed here.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated.',
    schema: { example: TENANT_ACCOUNT_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: 'Username or email already in use.' })
  update(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: UpdateTenantAccountDto) {
    return this.tenantAccountService.update(user.id, dto);
  }

  @Post('avatar')
  @RequireTenantPermissions('tenant-account:update')
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
    summary: 'Upload own profile picture',
    description:
      'Stores the image (max 5 MB) via the configured storage driver, replaces ' +
      'any previous avatar, and sets avatarPath on the profile.',
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar stored; path returned.',
    schema: { example: { path: 'tenant-avatars/019f37c9-c7d3-71df-8718-0c4e34a03426.jpg' } },
  })
  @ApiResponse({ status: 400, description: 'Missing, oversized, or non-image file.' })
  uploadAvatar(@CurrentTenantUser() user: TenantAuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.tenantAccountService.updateAvatar(user.id, file);
  }
}
