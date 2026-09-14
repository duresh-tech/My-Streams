import { SetMetadata } from '@nestjs/common';

export const SKIP_DEVICE_HEADER_KEY = 'skipDeviceHeader';

/**
 * Exempts a route from the `x-device-type` requirement. For machine callers
 * such as streaming server webhooks, which cannot send the header.
 */
export const SkipDeviceHeader = () => SetMetadata(SKIP_DEVICE_HEADER_KEY, true);
