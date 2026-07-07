import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { now } from '../common/utils/id.util';
import { UpdateAppSettingsDto } from './dto/system-settings.dto';

const SETTINGS_ID = 'default';
const DEFAULT_APP_NAME = 'System Console';
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get() {
    const existing = await this.prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;

    const timestamp = now();
    return this.prisma.appSettings.create({
      data: {
        id: SETTINGS_ID,
        appName: DEFAULT_APP_NAME,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  async update(dto: UpdateAppSettingsDto) {
    await this.get(); // ensure the singleton row exists
    return this.prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: { ...dto, updatedAt: now() },
    });
  }

  async updateLogo(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_LOGO_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const settings = await this.get();
    const path = await this.storage.upload(file, 'app-settings');
    if (settings.logoPath) {
      await this.storage.remove(settings.logoPath).catch(() => undefined);
    }
    await this.prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: { logoPath: path, updatedAt: now() },
    });
    return { path };
  }
}
