import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SkipDeviceHeader } from '../common/decorators/skip-device-header.decorator';
import { PublicShareService } from './public-share.service';

/**
 * Backs the public /share/{code} page. No session and no device header: the
 * share code itself is the credential, which is why rate limiting is
 * deliberately left ON here (unlike the server webhooks) - the code space is
 * finite and this is the only endpoint that can be used to search it.
 */
@ApiTags('Public / Share')
@Public()
@SkipDeviceHeader()
@Controller('public/share')
export class PublicShareController {
  constructor(private readonly share: PublicShareService) {}

  @Get(':code')
  @ApiOperation({
    summary: 'Resolve a share code to a playable stream',
    description:
      'Returns the stream title and its browser-playable URLs. Anything that would identify ' +
      'the business or customer behind the stream is omitted. A code that is unknown, ' +
      'malformed, disabled, deleted, or has no playable protocol all return the same 404, so ' +
      'the response cannot be used to tell valid codes from invalid ones.',
  })
  @ApiParam({ name: 'code', description: 'Six-character share code' })
  @ApiResponse({
    status: 200,
    description: 'Playable stream.',
    schema: {
      example: {
        title: 'Channel One',
        shareCode: 'kpxr4m',
        sources: [{ protocol: 'hls', label: 'HLS', url: 'https://play.example.com/live/ch01/index.m3u8' }],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'This share link is not valid.' })
  findByCode(@Param('code') code: string) {
    return this.share.findByCode(code);
  }
}
