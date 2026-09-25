import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantStreamsService } from '../tenant-streams/tenant-streams.service';
import { SHAREABLE_PLAY_PROTOCOLS } from '../tenant-streams/stream-protocols';
import { buildStreamUrls } from '../tenant-streams/stream-urls';
import { isShareCode } from '../tenant-streams/share-code';

/** Exactly what the public page needs, and deliberately nothing more. */
export interface PublicShareView {
  title: string;
  shareCode: string;
  /** Browser-playable sources, best first. */
  sources: Array<{ protocol: string; label: string; url: string }>;
}

@Injectable()
export class PublicShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: TenantStreamsService,
  ) {}

  /**
   * Resolves a share code to a playable stream.
   *
   * The response carries the title and the playback URLs only. The business,
   * the customer, the server's name and the stream's internal id are all left
   * out: anyone on the internet can call this with a guessed code, and a 404
   * should be the most they ever learn.
   */
  async findByCode(code: string): Promise<PublicShareView> {
    // Reject a malformed segment before it reaches the database, so scans for
    // SQL payloads or long strings cost nothing.
    if (!isShareCode(code)) throw new NotFoundException('This share link is not valid');

    const stream = await this.streams.findByShareCode(code);

    const server = await this.prisma.tenantFlussonicServer.findUnique({
      where: { id: stream.tenantFlussonicServerId },
      select: {
        domain: true,
        hostName: true,
        useSSL: true,
        httpPort: true,
        httpsPort: true,
        rtmpPort: true,
        rtspPort: true,
        srtPort: true,
      },
    });
    if (!server) throw new NotFoundException('This share link is not valid');

    // Public playback is built on the server's own domain and TLS setting.
    // The stream's ingest domain is where a publisher pushes to; it need not
    // serve playback, and if it is plain http the share page (https) has the
    // manifest request blocked as mixed content and the player never starts.
    const { outputs } = buildStreamUrls(stream, server, { preferServerHost: true });

    // Keep the declared preference order rather than the builder's, so the
    // player tries HLS before falling back to MP4.
    const sources = SHAREABLE_PLAY_PROTOCOLS.flatMap((protocol) =>
      outputs.filter((output) => output.protocol === protocol),
    );

    if (sources.length === 0) {
      // The stream exists but has no browser-playable protocol enabled - the
      // share button should not have been offered, so treat it as a dead link.
      throw new NotFoundException('This share link is not valid');
    }

    return { title: stream.title, shareCode: code, sources };
  }
}
