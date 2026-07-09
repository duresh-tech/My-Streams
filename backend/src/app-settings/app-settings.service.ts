import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { newId, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateAppSettingDto, UpdateAppSettingDto, validateValueForDataType } from './dto/app-settings.dto';
import { AppSettingListQueryDto } from './dto/app-settings-query.dto';

const APP_NAME_KEY = 'app.name';
const APP_LOGO_KEY = 'app.logo_path';
const DEFAULT_APP_NAME = 'System Console';
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOADS_FOLDER = 'app_settings_uploads';

/** Background screens pushed to a Bonrix DQ12 as raw RGB565 bitmaps. Configured
 * here (rather than hard-coded CDN URLs like Bonrix's own demo) so any tenant
 * can rebrand them from the App Settings admin page without a code change. */
const DQ12_IMAGE_KEYS = {
  welcome: 'qr_device.dq12.welcome_image',
  success: 'qr_device.dq12.success_image',
  pending: 'qr_device.dq12.pending_image',
  fail: 'qr_device.dq12.fail_image',
  cancel: 'qr_device.dq12.cancel_image',
  qrBackground: 'qr_device.dq12.qr_background_image',
} as const;

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: AppSettingListQueryDto) {
    const { page, limit, search, status, dataType, sortBy, sortOrder } = query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(dataType ? { dataType } : {}),
      ...(search
        ? {
            OR: [{ key: { contains: search } }, { description: { contains: search } }],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appSetting.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.appSetting.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const setting = await this.prisma.appSetting.findFirst({ where: { id, status: { not: 'DELETED' } } });
    if (!setting) throw new NotFoundException('App setting not found');
    return setting;
  }

  async findByKey(key: string) {
    const setting = await this.prisma.appSetting.findFirst({ where: { key, status: { not: 'DELETED' } } });
    if (!setting) throw new NotFoundException('App setting not found');
    return setting;
  }

  async create(dto: CreateAppSettingDto) {
    const existing = await this.prisma.appSetting.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException(`Key "${dto.key}" is already in use`);

    const timestamp = now();
    return this.prisma.appSetting.create({
      data: {
        id: newId(),
        key: dto.key,
        dataType: dto.dataType,
        value: dto.value,
        description: dto.description,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  async update(id: string, dto: UpdateAppSettingDto) {
    const setting = await this.findOne(id);
    if (dto.value !== undefined) {
      const error = validateValueForDataType(setting.dataType, dto.value);
      if (error) throw new BadRequestException(error);
    }
    return this.prisma.appSetting.update({
      where: { id },
      data: { ...dto, updatedAt: now() },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const timestamp = now();
    await this.prisma.appSetting.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: timestamp, updatedAt: timestamp },
    });
    return { success: true };
  }

  async restore(id: string) {
    const setting = await this.prisma.appSetting.findFirst({ where: { id, status: 'DELETED' } });
    if (!setting) throw new NotFoundException('App setting not found or not deleted');
    return this.prisma.appSetting.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, updatedAt: now() },
    });
  }

  /** The only place that hard-codes app.name/app.logo_path - keeps the public
   * branding contract stable regardless of how the generic store evolves. */
  async getBrandingPublic() {
    const [nameRow, logoRow] = await Promise.all([
      this.prisma.appSetting.findFirst({ where: { key: APP_NAME_KEY, status: 'ACTIVE' } }),
      this.prisma.appSetting.findFirst({ where: { key: APP_LOGO_KEY, status: 'ACTIVE' } }),
    ]);
    return {
      appName: nameRow?.value || DEFAULT_APP_NAME,
      logoPath: logoRow?.value || null,
    };
  }

  /** Public (unauthenticated, like getBrandingPublic) so both the system and
   * tenant QR-device pages can fetch these without needing system permissions -
   * missing keys just resolve to null, so the device page falls back to a
   * solid background rather than erroring. */
  async getDq12AssetsPublic() {
    const entries = Object.entries(DQ12_IMAGE_KEYS) as [keyof typeof DQ12_IMAGE_KEYS, string][];
    const rows = await Promise.all(
      entries.map(([, key]) => this.prisma.appSetting.findFirst({ where: { key, status: 'ACTIVE' } })),
    );
    const result = {} as Record<keyof typeof DQ12_IMAGE_KEYS, string | null>;
    entries.forEach(([name], index) => {
      result[name] = rows[index]?.value || null;
    });
    return result;
  }

  async uploadLogoValue(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_UPLOAD_SIZE) throw new BadRequestException('File exceeds the 5 MB limit');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('File must be an image');

    const existing = await this.prisma.appSetting.findUnique({ where: { key: APP_LOGO_KEY } });
    const path = await this.storage.upload(file, UPLOADS_FOLDER);
    if (existing?.value) {
      await this.storage.remove(existing.value).catch(() => undefined);
    }

    const timestamp = now();
    if (existing) {
      await this.prisma.appSetting.update({
        where: { key: APP_LOGO_KEY },
        data: { value: path, status: 'ACTIVE', deletedAt: null, updatedAt: timestamp },
      });
    } else {
      await this.prisma.appSetting.create({
        data: {
          id: newId(),
          key: APP_LOGO_KEY,
          dataType: 'STRING',
          value: path,
          description: 'Path to the application logo',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
    return { path };
  }

  /** Generic upload for any FILE-dataType setting's value - just stores the
   * file and returns its path; the caller decides which key it belongs to
   * via the normal create/update body, same as the tenant-customers flow. */
  async uploadValueFile(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_UPLOAD_SIZE) throw new BadRequestException('File exceeds the 5 MB limit');
    const path = await this.storage.upload(file, UPLOADS_FOLDER);
    return { path };
  }
}
