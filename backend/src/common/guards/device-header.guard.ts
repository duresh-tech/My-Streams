import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

export const DEVICE_HEADER = 'x-device-type';
export const ALLOWED_DEVICES = [
  'website',
  'androidApp',
  'iosApp',
  'desktopApp',
] as const;

export type DeviceType = (typeof ALLOWED_DEVICES)[number];

/**
 * Every API request must declare the calling device via the
 * `x-device-type` header (website | androidApp | iosApp | desktopApp).
 */
@Injectable()
export class DeviceHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const device = request.headers[DEVICE_HEADER];
    if (!device || !ALLOWED_DEVICES.includes(device)) {
      throw new BadRequestException(
        `Missing or invalid "${DEVICE_HEADER}" header. Allowed: ${ALLOWED_DEVICES.join(', ')}`,
      );
    }
    request.deviceType = device;
    return true;
  }
}
