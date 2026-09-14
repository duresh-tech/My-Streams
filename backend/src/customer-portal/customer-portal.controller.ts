import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerPortalService } from './customer-portal.service';
import {
  UpdateCustomerCredentialsDto,
  UpdateCustomerProfileDto,
} from './dto/customer-profile.dto';
import {
  CustomerCreateStreamDto,
  CustomerUpdateStreamDto,
} from './dto/customer-portal.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentCustomer,
  CustomerAuthUser,
} from '../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt-auth.guard';

const BILLING_EXAMPLE = {
  billedAs: 'SERVER',
  status: 'ACTIVE',
  planName: 'Server 10 streams',
  currentPeriodEnd: 1791829800,
  openInvoice: { id: '019f3d90-2222-7aaa-9062-adc0f927a584', invoiceNumber: 'INV-000002', currency: 'INR', balanceDue: 1180 },
};

const SERVER_EXAMPLE = {
  assignmentId: '019f357b-d398-73aa-9062-adc0f927a584',
  serverId: '019f357b-c211-71a0-9062-adc0f927a111',
  name: 'SX',
  serverStatus: 'ACTIVE',
  connectionStatus: 'CONNECTED',
  isDedicated: false,
  streamLimit: 10,
  streamsUsed: 3,
  streamsRemaining: 7,
  canCreateStream: true,
  canCheckConnection: true,
  billing: BILLING_EXAMPLE,
};

const STREAM_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'STR-MR8NZ6OO-C0CB',
  serverId: '019f357b-c211-71a0-9062-adc0f927a111',
  applicationName: 'live',
  streamKey: 'ch01',
  name: 'live/ch01',
  title: 'My channel',
  disabled: false,
  status: 'ACTIVE',
  protocols: { whitelist: true, hls: true },
  inputs: [{ priority: 1, url: 'publish://', comment: null, sourceTimeout: null }],
  server: {
    id: '019f357b-c211-71a0-9062-adc0f927a111',
    name: 'SX',
    status: 'ACTIVE',
    connectionStatus: 'CONNECTED',
  },
  billing: BILLING_EXAMPLE,
};

const PROFILE_EXAMPLE = {
  id: '019f357b-c211-71a0-9062-adc0f927a222',
  systemCode: 'TCU-MR8NZ6OO-C0CB',
  customerCode: 'CUS001',
  username: 'john',
  fName: 'John',
  lName: 'Doe',
  fatherName: 'Richard Doe',
  gender: 'MALE',
  dateOfBirth: '1990-04-17',
  primaryMobile: '9876543210',
  secondaryMobile: '9876500000',
  email: 'john@example.com',
  customerType: 'INDIVIDUAL',
  place: 'Tirunelveli',
  street: 'Bharathi Nagar',
  addressLine1: '12 South Street',
  addressLine2: 'Near the water tank',
  city: 'Tirunelveli',
  state: 'Tamil Nadu',
  country: 'India',
  pincode: '627001',
  latitude: 8.7139,
  longitude: 77.7567,
  customerPicture: 'customer-pictures/019f357c-d489-74a9-8490-1f82e745b199.webp',
  idProofType: 'Aadhar Card',
  idProofNumber: 'XXXX-XXXX-1234',
  taxType: 'GST',
  taxNumber: '33ABCDE1234F1Z5',
  status: 'ACTIVE',
  allowPortalAccess: true,
  createdAt: 1757836800,
  updatedAt: 1757836800,
};

/**
 * The customer portal. Every route is scoped to the signed-in customer; there
 * are no permission decorators because a customer has no role - what they may
 * reach is decided by stream ownership, server assignments and billing,
 * enforced in the service.
 */
@ApiTags('Customer / Portal')
@ApiBearerAuth()
@Public()
@UseGuards(CustomerJwtAuthGuard)
@Controller('customer')
export class CustomerPortalController {
  constructor(private readonly portal: CustomerPortalService) {}

  // ---------- Profile ----------

  @Get('profile')
  @ApiOperation({
    summary: 'Your profile',
    description:
      'Your own customer record, without the tenant-only fields. Coordinates come back as ' +
      'numbers and dateOfBirth as a plain YYYY-MM-DD date, with no timezone applied. ' +
      'customerPicture is a storage path, not a URL.',
  })
  @ApiResponse({ status: 200, description: 'Your profile.', schema: { example: PROFILE_EXAMPLE } })
  getProfile(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.portal.getProfile(customer);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Update your profile',
    description:
      'Accepts last name, father name, gender, date of birth, secondary mobile, place, street, ' +
      'both address lines, pincode, coordinates, ID proof and tax details. First name, mobile ' +
      'number, email, customer type and every commercial setting belong to your provider and ' +
      'are not accepted here. Send null to clear a field; omit it to leave it unchanged. ' +
      'Choosing a street without a place adopts the street own place.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile.', schema: { example: PROFILE_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description: 'A place or street outside your provider, a street that is not in the chosen place, or an out-of-range value.',
  })
  updateProfile(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.portal.updateProfile(customer, dto);
  }

  @Post('profile/picture')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Replace your profile picture',
    description:
      'Accepts PNG, JPG, JPEG or WEBP up to 1 MB, identified by its actual contents rather ' +
      'than its name. The image is re-encoded as WEBP - capped at 1024px on its longest edge ' +
      'and stripped of EXIF, including any GPS tag - and the previous file is deleted. ' +
      'Returns the updated profile plus the stored size in bytes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Picture replaced.',
    schema: { example: { ...PROFILE_EXAMPLE, bytes: 48213 } },
  })
  @ApiResponse({ status: 400, description: 'Missing, oversized, unsupported or unreadable image.' })
  updatePicture(
    @CurrentCustomer() customer: CustomerAuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portal.updatePicture(customer, file);
  }

  @Patch('profile/credentials')
  // Rate limited: this endpoint verifies a password, so it must not double as
  // an oracle for guessing one.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Change your username or password',
    description:
      'Your current password is required even though you are signed in. On success every ' +
      'session is ended, this one included, so the client must drop its token and sign in ' +
      'again - which is what signedOut:true in the response says. Refused while a support ' +
      'agent is signed in as you.',
  })
  @ApiResponse({
    status: 200,
    description: 'Changed; all sessions ended.',
    schema: {
      example: { success: true, usernameChanged: true, passwordChanged: true, signedOut: true },
    },
  })
  @ApiResponse({ status: 400, description: 'Wrong current password, or the username is taken.' })
  @ApiResponse({ status: 403, description: 'A support agent is signed in as you.' })
  updateCredentials(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: UpdateCustomerCredentialsDto,
  ) {
    return this.portal.updateCredentials(customer, dto);
  }

  @Get('servers')
  @ApiOperation({
    summary: 'Servers assigned to you',
    description:
      'Only ACTIVE assignments. Each entry carries the stream quota, live usage, and the ' +
      'canCreateStream / canCheckConnection flags so the UI can disable an action rather ' +
      'than let it fail - both require the server itself to be ACTIVE, and adding a stream ' +
      'also requires quota left. streamsRemaining is null when the quota is unlimited. ' +
      'Assignments on a deleted server are not listed. billing is the live SERVER subscription on ' +
      'the assignment (plan, status, period end, unpaid invoice), or null when not billed.',
  })
  @ApiResponse({ status: 200, description: 'Assigned servers.', schema: { example: [SERVER_EXAMPLE] } })
  listServers(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.portal.listServers(customer);
  }

  @Post('servers/:id/check-connection')
  // Each call reaches out to another host, so it is rate limited per client -
  // a held-down button must not turn into a probe flood.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Check whether one of your servers is reachable',
    description:
      'Connectivity only - no stats, version, host or credential detail. Requires the ' +
      'server to be ACTIVE, not that it was last seen connected. The result is recorded on ' +
      'the server record, so your provider sees the same check. Never fails for an ' +
      'unreachable server: the status comes back as UNREACHABLE or UNAUTHORIZED.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Connection state.',
    schema: {
      example: {
        serverId: '019f357b-c211-71a0-9062-adc0f927a111',
        name: 'Edge 01',
        connectionStatus: 'CONNECTED',
        connectionCheckedAt: 1757836800,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'That server is not assigned to you, or it is not active.',
  })
  checkServerConnection(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.checkServerConnection(customer, id);
  }

  @Get('streams')
  @ApiOperation({
    summary: 'Your streams',
    description:
      'Streams on a deleted server are not listed. billing is the stream\'s own STREAM subscription, ' +
      'or else the SERVER subscription covering its server (billedAs says which), or null. access.state ' +
      'is ACTIVE (period running), GRACE (ended less than grace days ago), BLOCKED (no active bill: ' +
      'edit, enable, reload and delete return 403, and the stream is switched off) or EXEMPT (enabled ' +
      'by the provider despite no bill).',
  })
  @ApiResponse({ status: 200, description: 'Your streams.', schema: { example: [STREAM_EXAMPLE] } })
  listStreams(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.portal.listStreams(customer);
  }

  @Get('streams/:id')
  @ApiOperation({ summary: 'One of your streams' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream.', schema: { example: STREAM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Not found, or not yours.' })
  getStream(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.getStream(customer, id);
  }

  @Get('streams/:id/view')
  @ApiOperation({
    summary: 'Live statistics and playback URLs for one of your streams',
    description: 'Status, clients, bitrates, uptime, media tracks, and the URLs to play from.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Live view.' })
  viewStream(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.viewStream(customer, id);
  }

  @Get('streams/:id/sessions')
  @ApiOperation({
    summary: 'Play sessions for one of your streams',
    description: 'Read live from the server; nothing is stored.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Active sessions.' })
  sessions(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.streamSessions(customer, id);
  }

  @Post('streams')
  @ApiOperation({
    summary: 'Create a stream on a server assigned to you',
    description:
      'Refused when the server is not assigned to you, or when your stream quota for it is ' +
      'already used up. The stream is always attached to your account.',
  })
  @ApiResponse({ status: 201, description: 'Created.', schema: { example: STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Quota reached, or the name is taken on that server.' })
  @ApiResponse({ status: 403, description: 'That server is not assigned to you.' })
  createStream(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() dto: CustomerCreateStreamDto,
  ) {
    return this.portal.createStream(customer, dto);
  }

  @Patch('streams/:id')
  @ApiOperation({
    summary: 'Update your stream',
    description:
      'Only the application name and the inputs can be changed. Changing the application name ' +
      'renames the stream on the server, which disconnects anyone watching the old name. ' +
      'Title, protocols and the server are set by your provider.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Updated.', schema: { example: STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'The new name is taken, or the server refused.' })
  updateStream(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Param('id') id: string,
    @Body() dto: CustomerUpdateStreamDto,
  ) {
    return this.portal.updateStream(customer, id, dto);
  }

  @Post('streams/:id/enable')
  @ApiOperation({ summary: 'Enable your stream' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Enabled.', schema: { example: STREAM_EXAMPLE } })
  enable(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.setDisabled(customer, id, false);
  }

  @Post('streams/:id/disable')
  @ApiOperation({ summary: 'Disable your stream' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Disabled.', schema: { example: STREAM_EXAMPLE } })
  disable(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.setDisabled(customer, id, true);
  }

  @Post('streams/:id/reload')
  @ApiOperation({
    summary: 'Reload your stream',
    description:
      'Disables and re-enables it on the server with a 1 second gap, to recover a stuck source. ' +
      'Viewers are interrupted for that moment.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Reloaded.', schema: { example: { success: true, gapMs: 1000 } } })
  reload(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.reloadStream(customer, id);
  }

  @Delete('streams/:id')
  @ApiOperation({
    summary: 'Delete your stream',
    description: 'Removes it from the server and frees a slot in your quota.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Deleted.', schema: { example: { success: true } } })
  deleteStream(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.portal.deleteStream(customer, id);
  }
}
