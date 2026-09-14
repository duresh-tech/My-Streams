import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { newId, now } from '../common/utils/id.util';
import { appTimezone } from '../common/utils/time.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { CreateAppSettingDto, UpdateAppSettingDto, validateValueForDataType } from './dto/app-settings.dto';
import { AppSettingListQueryDto } from './dto/app-settings-query.dto';

const APP_LOGO_KEY = 'app.logo_path';
const DEFAULT_APP_NAME = 'Project5';
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOADS_FOLDER = 'app_settings_uploads';

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
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

  /** The app name always comes from the APP_NAME env var (deployment-level
   * branding), not the DB - the app.name row still exists for backward
   * compatibility with the Customization page but no longer affects what's
   * displayed. Logo stays DB-driven since there's no env equivalent for it.
   *
   * `timezone` rides along here so the frontend can render timestamps in the
   * backend's zone without a second copy of the setting in its own env, where
   * the two could silently disagree. This endpoint is already fetched on load
   * for branding, so it costs no extra request. */
  async getBrandingPublic() {
    const logoRow = await this.prisma.appSetting.findFirst({ where: { key: APP_LOGO_KEY, status: 'ACTIVE' } });
    return {
      appName: this.config.get<string>('APP_NAME', DEFAULT_APP_NAME),
      logoPath: logoRow?.value || null,
      timezone: appTimezone(),
    };
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
