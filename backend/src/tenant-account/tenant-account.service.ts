import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { now } from '../common/utils/id.util';
import { UpdateTenantAccountDto } from './dto/tenant-account.dto';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const ACCOUNT_SELECT = {
  id: true,
  systemCode: true,
  fName: true,
  username: true,
  email: true,
  phone: true,
  avatarPath: true,
  roleId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, roleKey: true, displayName: true } },
} as const;

@Injectable()
export class TenantAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findMe(id: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id, status: { not: 'DELETED' } },
      select: ACCOUNT_SELECT,
    });
    if (!user) throw new NotFoundException('Tenant user not found');
    return user;
  }

  async update(id: string, dto: UpdateTenantAccountDto) {
    await this.assertUnique(dto.username, dto.email, id);

    const { password, ...fields } = dto;
    return this.prisma.tenantUser.update({
      where: { id },
      data: {
        ...fields,
        ...(password
          ? { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) }
          : {}),
        updatedAt: now(),
      },
      select: ACCOUNT_SELECT,
    });
  }

  async updateAvatar(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const user = await this.prisma.tenantUser.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!user) throw new NotFoundException('Tenant user not found');

    const path = await this.storage.upload(file, 'tenant-avatars');
    if (user.avatarPath) {
      await this.storage.remove(user.avatarPath).catch(() => undefined);
    }
    await this.prisma.tenantUser.update({
      where: { id },
      data: { avatarPath: path, updatedAt: now() },
    });
    return { path };
  }

  private async assertUnique(username?: string, email?: string, excludeId?: string) {
    if (!username && !email) return;
    const clash = await this.prisma.tenantUser.findFirst({
      where: {
        OR: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email }] : []),
        ],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) throw new ConflictException('Username or email already in use');
  }
}
