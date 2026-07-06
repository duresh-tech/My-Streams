import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as path from 'path';
import { newId } from '../common/utils/id.util';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * Driver-based storage. STORAGE_DRIVER=s3 uploads to cloud S3,
 * otherwise files land in the local public folder.
 * Only the relative PATH is returned/stored — never a full URL.
 * URL resolution is the consumer's concern (CDN, S3 signed URL, or
 * the backend's static /uploads route for local files).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly localDir: string;
  private s3?: S3Client;
  private bucket?: string;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get('STORAGE_DRIVER') === 's3' ? 's3' : 'local';
    this.localDir = this.config.get('LOCAL_STORAGE_DIR', 'public/uploads');

    if (this.driver === 's3') {
      this.bucket = this.config.getOrThrow('S3_BUCKET');
      this.s3 = new S3Client({
        region: this.config.getOrThrow('S3_REGION'),
        endpoint: this.config.get('S3_ENDPOINT') || undefined,
        credentials: {
          accessKeyId: this.config.getOrThrow('S3_ACCESS_KEY_ID'),
          secretAccessKey: this.config.getOrThrow('S3_SECRET_ACCESS_KEY'),
        },
      });
    }
  }

  /** Uploads a file and returns its storage path (not a URL). */
  async upload(file: UploadedFileLike, folder = 'general'): Promise<string> {
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '');
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const filename = `${newId()}${ext}`;
    const relativePath = `${safeFolder}/${filename}`;

    if (this.driver === 's3') {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: relativePath,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      this.logger.log(`Uploaded to S3: ${relativePath}`);
    } else {
      const absoluteDir = path.join(process.cwd(), this.localDir, safeFolder);
      await fs.mkdir(absoluteDir, { recursive: true });
      await fs.writeFile(path.join(absoluteDir, filename), file.buffer);
      this.logger.log(`Uploaded locally: ${relativePath}`);
    }
    return relativePath;
  }

  /** Deletes a previously stored file by its path. */
  async remove(relativePath: string): Promise<void> {
    if (this.driver === 's3') {
      await this.s3!.send(
        new DeleteObjectCommand({ Bucket: this.bucket!, Key: relativePath }),
      );
    } else {
      const absolute = path.join(process.cwd(), this.localDir, relativePath);
      await fs.rm(absolute, { force: true });
    }
  }

  get activeDriver(): string {
    return this.driver;
  }
}
