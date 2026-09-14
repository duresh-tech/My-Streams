import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantInvoicesService } from './tenant-invoices.service';
import {
  BillableCustomersQueryDto,
  CreateInvoiceDto,
  InvoiceListQueryDto,
  RecordPaymentDto,
  VoidInvoiceDto,
} from './dto/tenant-invoice.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const SUBSCRIPTION_SUMMARY_EXAMPLE = {
  id: '019f3d90-1111-7aaa-9062-adc0f927a584',
  status: 'ACTIVE',
  planId: '019f357b-d398-73aa-9062-adc0f927a584',
  planName: 'HD Starter',
  currentPeriodEnd: 1791829800,
  openInvoice: null,
};

const INVOICE_EXAMPLE = {
  id: '019f3d90-2222-7aaa-9062-adc0f927a584',
  systemCode: 'INV-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantCustomerId: '019f357b-c999-71a0-9062-adc0f927a584',
  invoiceNumber: 'INV-000001',
  status: 'ISSUED',
  isOverdue: false,
  currency: 'INR',
  issueDate: 1789237800,
  dueDate: 1789842600,
  subtotal: 249,
  discountTotal: 0,
  taxTotal: 44.82,
  grandTotal: 293.82,
  amountPaid: 0,
  balanceDue: 293.82,
  billedTo: { name: 'Ravi Kumar', customerCode: 'CUS-0001', phone: '9876543210' },
  billedFrom: { name: 'Acme Streams', taxNumber: '33ABCDE1234F1Z5' },
  notes: null,
  customer: { id: '019f357b-c999-71a0-9062-adc0f927a584', customerCode: 'CUS-0001', name: 'Ravi Kumar' },
  items: [
    {
      id: '019f3d90-3333-7aaa-9062-adc0f927a584',
      kind: 'SUBSCRIPTION_NEW',
      description: 'HD Starter (1 month) - Stream News HD (live/news_hd)',
      periodStart: 1789237800,
      periodEnd: 1791829800,
      quantity: 1,
      unitPrice: 249,
      discount: 0,
      taxName: 'GST 18%',
      taxCalculationType: 'PERCENTAGE',
      taxValue: 18,
      taxAmount: 44.82,
      lineTotal: 293.82,
      subscription: {
        id: '019f3d90-1111-7aaa-9062-adc0f927a584',
        status: 'PENDING_PAYMENT',
        planName: 'HD Starter',
        subscriptionFor: 'STREAM',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        streamLimit: null,
        server: { id: '019f357b-5555-71a0-9062-adc0f927a584', name: 'Chennai-01' },
        stream: { id: '019f357b-6666-71a0-9062-adc0f927a584', name: 'live/news_hd', title: 'News HD' },
      },
    },
  ],
  payments: [],
};

@ApiTags('Tenant / Invoices')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/invoices')
export class TenantInvoicesSelfController {
  constructor(private readonly invoicesService: TenantInvoicesService) {}

  @Get('options')
  @RequireTenantPermissions('tenant-invoices:create')
  @ApiOperation({
    summary: 'Plans, tax types and billing defaults for the new-invoice form',
    description: 'Only ACTIVE plans and tax types are returned.',
  })
  @ApiResponse({
    status: 200,
    description: 'Form options.',
    schema: {
      example: {
        currency: 'INR',
        activateOn: 'PAYMENT',
        invoiceDueDays: 7,
        defaultTaxTypeId: '019f357b-e001-7abc-9062-adc0f927a584',
        plans: [
          {
            id: '019f357b-d398-73aa-9062-adc0f927a584',
            name: 'HD Starter',
            subscriptionFor: 'STREAM',
            durationValue: 1,
            durationUnit: 'MONTH',
            customerPrice: 249,
            orginalPrice: 299,
            maxServerStream: null,
            maxPlaySession: 2,
          },
        ],
        taxTypes: [
          { id: '019f357b-e001-7abc-9062-adc0f927a584', taxName: 'GST 18%', calculationType: 'PERCENTAGE', value: 18 },
        ],
      },
    },
  })
  options(@CurrentTenantUser() user: TenantAuthUser) {
    return this.invoicesService.optionsForTenantUser(user.id);
  }

  @Get('options/customers')
  @RequireTenantPermissions('tenant-invoices:create')
  @ApiOperation({
    summary: 'Customers that can be billed',
    description: 'Customers with at least one ACTIVE server assignment or stream. Up to 200, searchable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billable customers.',
    schema: {
      example: [
        { id: '019f357b-c999-71a0-9062-adc0f927a584', customerCode: 'CUS-0001', name: 'Ravi Kumar', primaryMobile: '9876543210' },
      ],
    },
  })
  billableCustomers(@CurrentTenantUser() user: TenantAuthUser, @Query() query: BillableCustomersQueryDto) {
    return this.invoicesService.billableCustomersForTenantUser(user.id, query);
  }

  @Get('options/customers/:customerId/billables')
  @RequireTenantPermissions('tenant-invoices:create')
  @ApiOperation({
    summary: "A customer's billable servers and streams",
    description:
      "ACTIVE server assignments with stream usage, and all of the customer's streams. Each carries " +
      'its live subscription, if any - an ACTIVE one means the next invoice is a renewal, a ' +
      'PENDING_PAYMENT one means an unpaid invoice must be collected or voided first.',
  })
  @ApiParam({ name: 'customerId', description: 'Customer UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Billable targets.',
    schema: {
      example: {
        servers: [
          {
            assignmentId: '019f357b-7777-71a0-9062-adc0f927a584',
            serverId: '019f357b-5555-71a0-9062-adc0f927a584',
            serverName: 'Chennai-01',
            streamLimit: 5,
            streamsUsed: 2,
            isDedicated: false,
            subscription: null,
          },
        ],
        streams: [
          {
            streamId: '019f357b-6666-71a0-9062-adc0f927a584',
            name: 'live/news_hd',
            title: 'News HD',
            serverName: 'Chennai-01',
            disabled: false,
            subscription: SUBSCRIPTION_SUMMARY_EXAMPLE,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Customer not found.' })
  billables(@CurrentTenantUser() user: TenantAuthUser, @Param('customerId') customerId: string) {
    return this.invoicesService.billablesForTenantUser(user.id, customerId);
  }

  @Get('options/payment-modes')
  @RequireTenantPermissions('tenant-payments:create')
  @ApiOperation({ summary: 'ACTIVE payment modes for recording a payment' })
  @ApiResponse({
    status: 200,
    description: 'Payment modes.',
    schema: { example: [{ id: '019f357b-8888-71a0-9062-adc0f927a584', paymentName: 'UPI' }] },
  })
  paymentModes(@CurrentTenantUser() user: TenantAuthUser) {
    return this.invoicesService.paymentModesForTenantUser(user.id);
  }

  @Post('preview')
  @RequireTenantPermissions('tenant-invoices:create')
  @ApiOperation({
    summary: 'Calculate an invoice without creating it',
    description:
      'Runs exactly the validation and arithmetic of create. A new subscription with no startDate, or ' +
      "today's, starts at this moment and moves to the moment its invoice activates; a later startDate " +
      'starts at that midnight, and a past one is refused. Otherwise new subscriptions start at startDate ' +
      '(default today) and expire one plan duration later, midnight to midnight in the app timezone. ' +
      'A target with an ACTIVE subscription is renewed instead: same plan and price, starting at the ' +
      'current period end.',
  })
  @ApiResponse({
    status: 201,
    description: 'The invoice that create would issue.',
    schema: {
      example: {
        kind: 'NEW',
        billFor: 'STREAM',
        target: { label: 'Stream News HD (live/news_hd)', serverName: 'Chennai-01', stream: { id: '019f357b-6666-71a0-9062-adc0f927a584', name: 'live/news_hd', title: 'News HD' } },
        plan: { id: '019f357b-d398-73aa-9062-adc0f927a584', name: 'HD Starter', durationValue: 1, durationUnit: 'MONTH' },
        currentSubscription: null,
        periodStart: 1789237800,
        periodEnd: 1791829800,
        currency: 'INR',
        line: { description: 'HD Starter (1 month) - Stream News HD (live/news_hd)', unitPrice: 249, discount: 0, taxName: 'GST 18%', taxAmount: 44.82, lineTotal: 293.82 },
        totals: { subtotal: 249, discountTotal: 0, taxTotal: 44.82, grandTotal: 293.82 },
        issueDate: 1789290000,
        dueDate: 1789894800,
        activateOn: 'PAYMENT',
        warnings: [],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Target not assigned, unpaid invoice outstanding, wrong plan type, or plan limit below current usage.',
  })
  @ApiResponse({ status: 403, description: 'Discount without tenant-invoices:add_discount.' })
  preview(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.previewForTenantUser(user, dto);
  }

  @Get()
  @RequireTenantPermissions('tenant-invoices:list')
  @ApiOperation({
    summary: "List your business's invoices",
    description: 'Filters: status, customerId; search matches invoice number and customer name/code.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated invoice list.',
    schema: { example: { items: [INVOICE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: InvoiceListQueryDto) {
    return this.invoicesService.listForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-invoices:view')
  @ApiOperation({ summary: 'Get an invoice with its lines, subscriptions and payments' })
  @ApiParam({ name: 'id', description: 'Invoice UUIDv7' })
  @ApiResponse({ status: 200, description: 'Invoice detail.', schema: { example: INVOICE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.invoicesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-invoices:create')
  @ApiOperation({
    summary: 'Create and issue an invoice for a stream or server',
    description:
      'Issues immediately with the next invoice number and opens (or renews) the subscription. The ' +
      'subscription becomes ACTIVE once any payment is recorded, or on issue if billing settings ' +
      'activateOn=ISSUE. SERVER plans then set the assignment stream limit. warnings lists anything ' +
      'the tenant should check. periods (1-24, default 1) bills that many plan durations ahead on ' +
      'one line. An optional payment { paymentModeId, amount, paidDate?, referenceNo?, remark? } is ' +
      'recorded in the same transaction and requires tenant-payments:create.',
  })
  @ApiResponse({ status: 201, description: 'Invoice issued.', schema: { example: { ...INVOICE_EXAMPLE, warnings: [] } } })
  @ApiResponse({ status: 400, description: 'Same as preview, or the period is already invoiced.' })
  @ApiResponse({ status: 403, description: 'Discount without tenant-invoices:add_discount.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createForTenantUser(user, dto);
  }

  @Post(':id/payments')
  @RequireTenantPermissions('tenant-payments:create')
  @ApiOperation({
    summary: 'Record a payment against an invoice',
    description:
      'Partial payments are allowed; the amount cannot exceed the balance due. Any payment ' +
      'activates the subscription for the invoiced period.',
  })
  @ApiParam({ name: 'id', description: 'Invoice UUIDv7' })
  @ApiResponse({
    status: 201,
    description: 'Payment recorded; the updated invoice.',
    schema: { example: { ...INVOICE_EXAMPLE, status: 'PAID', amountPaid: 293.82, balanceDue: 0, warnings: [] } },
  })
  @ApiResponse({ status: 400, description: 'Invoice not payable, inactive payment mode, future date, or amount over balance.' })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  recordPayment(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.invoicesService.recordPaymentForTenantUser(user.id, id, dto);
  }

  @Post(':id/void')
  @RequireTenantPermissions('tenant-invoices:void')
  @ApiOperation({
    summary: 'Cancel an invoice',
    description:
      'ISSUED, PARTIALLY_PAID or PAID invoices; the status becomes VOID and the number stays used. ' +
      'Recorded payments are voided with it, with their income entries, which requires ' +
      'tenant-payments:void. A subscription it opened is cancelled and a renewal it added is rolled ' +
      'back; stream limits already applied are not reverted. Refused while a later invoice bills the ' +
      'same subscription.',
  })
  @ApiParam({ name: 'id', description: 'Invoice UUIDv7' })
  @ApiResponse({ status: 201, description: 'Invoice voided.', schema: { example: { ...INVOICE_EXAMPLE, status: 'VOID' } } })
  @ApiResponse({ status: 400, description: 'Invoice is a draft or already cancelled, or a later invoice bills the same subscription.' })
  @ApiResponse({ status: 403, description: 'The invoice has payments and the caller lacks tenant-payments:void.' })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  void(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string, @Body() dto: VoidInvoiceDto) {
    return this.invoicesService.voidForTenantUser(user, id, dto);
  }
}
