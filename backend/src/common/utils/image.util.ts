import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** What a customer may upload as a picture. */
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

/** Hard cap on the upload itself, before any conversion. */
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB

/** Longest edge kept after conversion; a profile picture needs no more. */
const MAX_DIMENSION = 1024;

/** Quality for the webp encoder - visually clean and a fraction of the size. */
const WEBP_QUALITY = 82;

/**
 * Identifies an image by its leading bytes rather than by the declared type.
 *
 * `mimetype` and `originalname` both come from the client and can say anything,
 * so neither is evidence. Sniffing the container is what actually keeps a
 * renamed executable or SVG (which can carry script) out of the store.
 */
function sniffFormat(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}

export interface ConvertedImage {
  buffer: Buffer;
  /** Always image/webp - the point of the conversion. */
  mimetype: string;
  /** Suggested filename, so the stored path carries the right extension. */
  originalname: string;
  size: number;
  width: number | null;
  height: number | null;
}

/**
 * Validates an uploaded image and re-encodes it as webp.
 *
 * Re-encoding is not only about size: decoding and re-writing the pixels drops
 * every ancillary chunk the original carried - EXIF (including GPS), colour
 * profiles, comments, and anything hidden in a trailing segment - so what lands
 * in storage is only an image. The orientation is applied first, otherwise a
 * phone photo comes out rotated once its EXIF tag is gone.
 */
export async function toWebpImage(
  file: { buffer: Buffer; originalname?: string; size?: number },
  basename = 'image',
): Promise<ConvertedImage> {
  const source = file.buffer;
  if (!source || source.length === 0) throw new BadRequestException('The file is empty');
  if (source.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException('The picture must be 1 MB or smaller');
  }

  const format = sniffFormat(source);
  if (!format) {
    throw new BadRequestException('Only PNG, JPG, JPEG and WEBP pictures are accepted');
  }

  try {
    const pipeline = sharp(source, { failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        // Never upscale: a small avatar stays small rather than being blown up.
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      mimetype: 'image/webp',
      originalname: `${basename}.webp`,
      size: data.length,
      width: info.width ?? null,
      height: info.height ?? null,
    };
  } catch {
    // A truncated or malformed file passes the signature check but fails to
    // decode; that is a bad upload, not a server fault.
    throw new BadRequestException('That picture could not be read. Try another file.');
  }
}
