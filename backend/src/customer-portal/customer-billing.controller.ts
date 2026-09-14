import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomerBillingService } from './customer-billing.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentCustomer, CustomerAuthUser } from '../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt-auth.guard';

const INVOICE_SUMMARY_EXAMPLE = {
  id: '019f3d90-2222-7aaa-9062-adc0f927a584',
  invoiceNumber: 'INV-000001',
  status: 'PARTIALLY_PAID',
  currency: 'INR',
  issueDate: 1789237800,
  dueDate: 1789842600,
  description: 'HD Starter (3 x 1 month) - Stream News HD (live/news_hd)',
  grandTotal: 881.46,
  amountPaid: 500,
  balanceDue: 381.46,
  isOverdue: false,
};

const INVOICE_DETAIL_EXAMPLE = {
  id: '019f3d90-2222-7aaa-9062-adc0f927a584',
  invoiceNumber: 'INV-000001',
  status: 'PARTIALLY_PAID',
  currency: 'INR',
  issueDate: 1789237800,
  dueDate: 1789842600,
  subtotal: 747,
  discountTotal: 0,
  taxTotal: 134.46,
  grandTotal: 881.46,
  amountPaid: 500,
  balanceDue: 381.46,
  isOverdue: false,
  billedTo: { name: 'Ravi Kumar', customerCode: 'CUS-0001', phone: '9876543210' },
  billedFrom: { name: 'Acme Streams', taxNumber: '33ABCDE1234F1Z5' },
  notes: null,
  voidedAt: null,
  items: [
    {
      id: '019f3d90-3333-7aaa-9062-adc0f927a584',
      description: 'HD Starter (3 x 1 month) - Stream News HD (live/news_hd)',
      periodStart: 1789237800,
      periodEnd: 1797100200,
      quantity: 3,
      unitPrice: 249,
      discount: 0,
      taxName: 'GST 18%',
      taxAmount: 134.46,
      lineTotal: 881.46,
    },
  ],
  payments: [
    { id: '019f3d90-5555-7aaa-9062-adc0f927a584', amount: 500, paidAt: 1789290000, referenceNo: 'UPI-88213', paymentMode: 'UPI' },
  ],
};

/** The customer's own billing history. Scoped by ownership, like the rest of the portal. */
@ApiTags('Customer / Billing')
@ApiBearerAuth()
@Public()
@UseGuards(CustomerJwtAuthGuard)
@Controller('customer/billing')
export class CustomerBillingController {
  constructor(private readonly billing: CustomerBillingService) {}

  @Get('invoices')
  @ApiOperation({
    summary: 'Your invoices',
    description:
      'Issued, part paid, paid and cancelled (VOID) invoices, newest first, up to 200. Drafts are never ' +
      'shown. A cancelled invoice has a balanceDue of 0.',
  })
  @ApiResponse({ status: 200, description: 'Invoice history.', schema: { example: [INVOICE_SUMMARY_EXAMPLE] } })
  listInvoices(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.billing.listInvoices(customer);
  }

  @Get('invoices/:id')
  @ApiOperation({
    summary: 'One of your invoices',
    description: 'With its lines and recorded payments. Voided payments are not listed.',
  })
  @ApiParam({ name: 'id', description: 'Invoice UUIDv7' })
  @ApiResponse({ status: 200, description: 'Invoice.', schema: { example: INVOICE_DETAIL_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Not found, a draft, or not yours.' })
  getInvoice(@CurrentCustomer() customer: CustomerAuthUser, @Param('id') id: string) {
    return this.billing.getInvoice(customer, id);
  }
}
