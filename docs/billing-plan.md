# Billing — Implementation Plan

Status: **Phase 1 done; invoicing done** (the create/issue/pay/void part of Phases 2-3). Tenant users bill an assigned customer's stream or server at `/tenant/billing/invoices`: the expiry is calculated from the plan, active subscriptions renew from their current expiry, payments are recorded, and unpaid invoices can be voided. **Not built yet:** the lifecycle job (PAST_DUE / SUSPENDED), plan change, customer-portal billing, and the system-admin surface. Q3 (renewals keep the subscribed price) and Q4 (manual payments) are implemented as recommended; Q5 and Q6 remain open. Every other choice has a recommended default, and the reason is given beside it.

Scope: tenants sell their existing **Subscription Plans** (`STREAM` or `SERVER`) to their customers. That means a subscription record, invoices with tax, recorded payments, renewal and expiry, and enforcing the plan's limits on the streaming side. All of it follows the dual-surface, permission-gated patterns already in the repo.

---

## 1. Decisions

| # | Question | Recommendation | State |
|---|---|---|---|
| 1 | What does a plan type *grant*? | **A STREAM plan bills one specific stream** (`TenantSubscription.tenantStreamId`); its play-session and protocol limits are recorded now and enforced in Phase 7. **A SERVER plan bills an existing server assignment** and sets its `streamLimit` from `maxServerStream` on activation; `isDedicated` stays as assigned. Both require the customer to be actively assigned to the server | decided |
| 2 | When does a subscription become ACTIVE? | **On full payment**, set per business in billing settings (`activateOn = PAYMENT \| ISSUE`). Some tenants give access on credit, so `ISSUE` is allowed | **OPEN** |
| 3 | Renewal price when the plan's price changed | **Grandfathered.** A renewal uses the subscription's snapshot price. The tenant moves a customer to new pricing with *Change plan*. The customer's bill never changes silently | **OPEN** |
| 4 | Payment collection | **Manual recording only** in this plan, against the existing `TenantPaymentMode`s (cash, UPI, bank…). A payment gateway (e.g. Razorpay) is a later phase with its own plan | **OPEN** |
| 5 | Plan change mid-period | **No proration.** A downgrade takes effect at the next renewal. An upgrade starts a new full period now at the new price, and the tenant may add a discount line. Proration is a later phase | **OPEN** |
| 6 | Customer portal | **Read-only billing:** their subscriptions, expiry, invoices, payments, and the plan catalogue (`showCustomer = true`). No self-purchase until a gateway exists, because a customer could not pay anyway | **OPEN** |
| 7 | Reseller pricing | **Out of scope.** `resellerPrice` / `showReseller` exist, but there is no reseller principal to bill. The columns stay dormant | default |
| 8 | Can subscriptions / invoices be deleted? | **No.** Commercial records are *cancelled* / *voided*, never soft-deleted. This deliberately departs from the `status = DELETED` convention: a deleted invoice number is a gap an auditor asks about | default |
| 9 | Where does expiry run? | `@nestjs/schedule` (not installed yet), an hourly job. This is the same dependency Phase 7 of the stream plan needs | default |
| 10 | Invoice PDF | **Print-friendly page + `window.print()`**. No PDF library on the backend | default |
| 11 | Tests | **Node's built-in `node:test` runner via the existing `ts-node`** — no new dependency. `npm test` runs `backend/test/**/*.spec.ts` (outside `src/`, so `nest build` never compiles them) | decided |

---

## 2. What already exists in this repo

| Piece | Where | Reused for |
|---|---|---|
| `TenantSubscriptionPlan` (type, limits, protocols, duration, 3 prices, visibility) | `schema.prisma`, `tenant-subscription-plans/` | The catalogue a subscription is bought from |
| `TenantCustomerServer` (`streamLimit`, `isDedicated`) + `assertLimitCoversUsage`, `assertServerFreeForDedication` | `tenant-customer-servers.service.ts` | **The technical grant.** A subscription drives it, and quota enforcement needs no new code |
| Quota check on stream create | `customer-portal.service.ts` `assertQuotaAvailable` | Already enforces `streamLimit`, so a subscription's limit is live the moment the assignment is written |
| `TenantTaxType` (`PERCENTAGE \| FIXED`) | `tenant-tax-types/` | Invoice line tax |
| `TenantPaymentMode` | `tenant-payment-modes/` | How a payment was made |
| Stream enable/disable write-through | `tenant-streams.service.ts` | Suspending and resuming service |
| Dual controller + `getMappedBusinessId` scoping | every `tenant-*` module | Billing gets the same surfaces |
| `RequireTenantPermissions`, seed `MODULES` | `common/decorators`, `prisma/seed.ts` | Permissions |
| `TenantMailConfig` + nodemailer | `tenant-mail-config/` | Invoice / expiry emails (later phase) |
| Decimal money + `serializePlan` number conversion | `tenant-subscription-plans.service.ts` | Same money handling throughout |
| `ResourceTable`, `RowActionsMenu`, `useResourceList`, `tenantApi`, `customerApi`, `useAppTimezone` | `frontend/src` | Every billing screen |

Nothing billing-related exists yet: no invoice, payment, or subscription-instance model, and no scheduler.

---

## 3. Core model: commercial record vs technical grant

```
TenantSubscriptionPlan ──(snapshot at purchase)──▶ TenantSubscription ──drives──▶ TenantCustomerServer
      catalogue                                     commercial record              technical grant
                                                          │                        (streamLimit, isDedicated,
                                                          │                         status) ─▶ quota enforcement
                                                          ▼
                                                    TenantInvoice ◀── TenantPayment
                                                    (+ items, one per period)
```

- **The subscription never enforces anything itself.** It writes the assignment, and the existing quota code enforces it. That keeps enforcement in one place, as the stream plan (§7) intended.
- **One live subscription per (customer, server).** This mirrors the assignment's `@@unique([tenantCustomerId, tenantFlussonicServerId])`. It is enforced in the service, because MySQL has no partial unique index.
- **Manual assignments still work.** A tenant can grant a server with no subscription (a free or complimentary grant). An assignment backed by a live subscription is **managed**: the Customer Servers page locks `streamLimit` / `isDedicated` / delete on it and points to *Change plan* / *Cancel*. Otherwise the two would silently fight.

---

## 4. Data model

All IDs are UUIDv7 and all timestamps are BIGINT epoch seconds, as elsewhere. Money is `Decimal(12,2)`. No vendor names appear in the API.

### 4.1 `TenantBillingSettings` — one row per business

Created lazily with defaults on first read. This is the same one-per-account shape as mail config.

```
id, tenantBusinessId @unique
currency            Char(3)   @default("INR")
invoicePrefix       VarChar(20) @default("INV-")
nextInvoiceNumber   Int       @default(1)
invoiceDueDays      Int       @default(7)
renewalLeadDays     Int       @default(7)     -> renewal invoice issued this many days before period end
graceDays           Int       @default(3)     -> PAST_DUE lasts this long before SUSPENDED
activateOn          enum      PAYMENT | ISSUE (§1 Q2)
defaultTaxTypeId    Char(36)?                  -> preselected on new invoices
invoiceFooter       Text?
createdAt/By, updatedAt/By
```

### 4.2 `TenantSubscription`

```
id, systemCode (prefix SBS)
tenantBusinessId, tenantCustomerId, tenantSubscriptionPlanId, tenantFlussonicServerId
tenantCustomerServerId?        -> set once the grant is written

-- Snapshot of the plan at purchase (plan edits never alter a sold subscription)
subscriptionFor     enum STREAM | SERVER
planName            VarChar(150)
streamLimit         Int?        -> maxStreams or maxServerStream, null = unlimited
maxPlaySession      Int?
playbackProtocols   Json?
durationValue       Int
durationUnit        enum DAY | MONTH | YEAR
unitPrice           Decimal(12,2)   -> customerPrice at purchase
isDedicated         Boolean

status              enum (§5.1)
currentPeriodStart  BigInt?
currentPeriodEnd    BigInt?
autoRenew           Boolean @default(true)
cancelAtPeriodEnd   Boolean @default(false)
pendingPlanId       Char(36)?   -> downgrade scheduled for next renewal (§1 Q5)
suspendedStreamIds  Json?       -> exactly the streams billing disabled (§5.4)
cancelledAt/By, suspendedAt, remark
createdAt/By, updatedAt/By

@@index([tenantBusinessId]) @@index([tenantCustomerId])
@@index([status, currentPeriodEnd])      -> the lifecycle job's scan
```

**Why a snapshot and not a live FK read.** A tenant editing "HD Starter" from 1 stream to 2 must not silently upgrade every customer already on it, or raise their renewal price (§1 Q3). The FK stays for reporting ("who is on this plan").

### 4.3 `TenantInvoice`

```
id, systemCode, tenantBusinessId, tenantCustomerId
invoiceNumber       VarChar(40)   -> prefix + zero-padded sequence, assigned on ISSUE, not on draft
status              enum DRAFT | ISSUED | PARTIALLY_PAID | PAID | VOID
currency            Char(3)
issueDate, dueDate  BigInt?
subtotal, discountTotal, taxTotal, grandTotal, amountPaid   Decimal(12,2)
billedTo            Json   -> customer name, code, address, taxNumber at issue
billedFrom          Json   -> business name, address, taxNumber, logoPath at issue
notes               Text?
voidedAt/By, voidReason
createdAt/By, updatedAt/By

@@unique([tenantBusinessId, invoiceNumber])
@@index([tenantCustomerId]) @@index([status, dueDate])
```

- **Overdue is derived, not a status.** `isOverdue = status in (ISSUED, PARTIALLY_PAID) && dueDate < now` is computed in the serializer. This avoids a job flipping statuses just because time passed.
- **The snapshots (`billedTo` / `billedFrom`)** exist because an issued invoice must not change when the customer later edits their address.
- `balanceDue = grandTotal − amountPaid` is derived.

### 4.4 `TenantInvoiceItem`

```
id, tenantInvoiceId (cascade)
tenantSubscriptionId?     -> null for manual adjustment lines
kind            enum SUBSCRIPTION_NEW | SUBSCRIPTION_RENEWAL | PLAN_CHANGE | ADJUSTMENT
description     VarChar(255)
periodStart?, periodEnd?  BigInt
quantity        Int @default(1)
unitPrice, discount       Decimal(12,2)
taxName?, taxCalculationType?, taxValue?   -> snapshot of TenantTaxType
taxAmount, lineTotal      Decimal(12,2)
sortOrder       Int

@@unique([tenantSubscriptionId, periodStart])   -> §5.3 idempotency
```

**The unique constraint makes renewal safe to retry.** If the job runs twice, or two instances run at once, the second renewal invoice for the same period fails to insert instead of double-billing the customer. MySQL treats NULLs as distinct, so adjustment lines are unaffected.

### 4.5 `TenantPayment`

```
id, systemCode, tenantBusinessId, tenantCustomerId, tenantInvoiceId
tenantPaymentModeId
amount          Decimal(12,2)   -> > 0, <= invoice balance
paidAt          BigInt
referenceNo     VarChar(100)?   -> UPI ref / cheque no
remark          VarChar(255)?
status          enum RECORDED | VOID
voidedAt/By, voidReason
createdAt/By

@@index([tenantInvoiceId]) @@index([tenantCustomerId])
```

Overpayment, customer credit balances and refunds are out of scope (§12).

### 4.6 Changes to existing models

| Model | Change |
|---|---|
| `TenantBusiness`, `TenantCustomer`, `TenantSubscriptionPlan`, `TenantFlussonicServer`, `TenantPaymentMode`, `TenantTaxType` | Back-relations only |
| `TenantCustomerServer` | Back-relation to `TenantSubscription`. **No new columns**: "managed" is derived from a live subscription |
| `TenantSubscriptionPlan.orginalPrice` | Typo left alone. Renaming it is a separate migration and API change, so it is not bundled into billing |

---

## 5. Lifecycle

### 5.1 Subscription states

```
                ┌──────── pay in full (activateOn=PAYMENT) / issue (activateOn=ISSUE)
                ▼
PENDING_PAYMENT ──▶ ACTIVE ──period ends, renewal unpaid──▶ PAST_DUE ──graceDays pass──▶ SUSPENDED
      │               ▲  │                                     │                           │
      │               │  └──── renewal paid ◀──────────────────┘                           │
      │               └──────────────────────── renewal paid (new period from payment) ◀───┘
      └── cancel ──▶ CANCELLED ◀── cancel (now, or at period end if cancelAtPeriodEnd) ── any live state
```

| State | Assignment | Streams | Customer can create streams |
|---|---|---|---|
| `PENDING_PAYMENT` | not written | — | no |
| `ACTIVE` | ACTIVE, limit from snapshot | running | yes, up to limit |
| `PAST_DUE` | ACTIVE | running (grace) | **no**: the portal shows a renew banner |
| `SUSPENDED` | INACTIVE | billing-disabled (§5.4) | no |
| `CANCELLED` | INACTIVE, or removed if no streams remain | billing-disabled | no |

### 5.2 Period arithmetic

Pure functions in `billing-math.ts`, computed in `APP_TIMEZONE` (`common/utils/time.util.ts`):

- `addDuration(start, value, unit)`. **MONTH/YEAR clamp to month end**: Jan 31 + 1 month = Feb 28/29, and Feb 29 + 1 year = Feb 28. Naive `+30 days` drifts, and naive `setMonth` overflows into March.
- Renewal from an **ACTIVE / PAST_DUE** subscription starts at `currentPeriodEnd`. Paying late does not shorten the period the customer paid for.
- Renewal from **SUSPENDED** starts at the **payment time**. Days without service are not back-billed.

### 5.3 Lifecycle job (`BillingLifecycleService`, hourly)

Each step is a query plus a pure decision function, and each is idempotent:

1. **Issue renewal invoices.** ACTIVE, `autoRenew`, not `cancelAtPeriodEnd`, `currentPeriodEnd − renewalLeadDays ≤ now`, and no item exists for the next `periodStart`. If `pendingPlanId` is set, the next period uses that plan's snapshot (a scheduled downgrade).
2. **ACTIVE → PAST_DUE.** `currentPeriodEnd ≤ now` and the next period is unpaid.
3. **PAST_DUE → SUSPENDED.** `currentPeriodEnd + graceDays ≤ now`. Suspend service (§5.4).
4. **Cancel at period end.** `cancelAtPeriodEnd` and `currentPeriodEnd ≤ now` → CANCELLED.

Guards: a DB-level run lock (a row in `app_settings`, or `GET_LOCK` on MySQL) stops two app instances overlapping. Per-subscription failures are logged and skipped, so one bad row does not stop the batch.

### 5.4 Suspension without trampling the customer's own choices

Streams have a `disabled` flag the customer may already have set themselves. If suspension disabled "all streams" and resume enabled "all streams", resuming would switch on streams the customer deliberately turned off.

- **Suspend:** disable only streams on that server where `disabled = false`, and record their IDs in `suspendedStreamIds`.
- **Resume:** re-enable exactly those IDs (if still present and not deleted), then clear the list.
- **Blocked while suspended:** the customer portal's enable action checks the assignment is ACTIVE (verify `requireAssignment` already does this). A tenant user with `tenant-streams:enable` can still override.
- Write-through failures leave the stream `PENDING_PUSH`, as today. Suspension is recorded even if the server is unreachable.

**Considered and rejected:** a `billingSuspended` column on `TenantStream` merged into the pushed `disabled` value. It changes the stream config mapper and `configHash`, which risks false drift on every stream (stream plan §5.3) for a feature that does not need it.

### 5.5 Invoice issue and payment (one transaction each)

**Issue:**
1. `SELECT … FOR UPDATE` the settings row.
2. Take `nextInvoiceNumber` and increment it.
3. Set the number, dates and snapshots.
4. Recompute totals server-side.

Numbers are gapless per business, because drafts do not consume one.

**Record payment:**
1. Lock the invoice row.
2. Check `amount ≤ balanceDue`, insert the payment, and add it to `amountPaid`.
3. Set status to `PARTIALLY_PAID` or `PAID`.
4. If `PAID`, activate or extend each linked subscription: set the period, write the assignment (§3), and resume if it was suspended.

Assignment writes go through `TenantCustomerServersService`, so `assertLimitCoversUsage` / `assertServerFreeForDedication` apply. A payment is never lost when the grant fails: the payment commits, the subscription stays `PENDING_PAYMENT`, and the error is shown for the tenant to resolve.

**Void invoice:** allowed only with no RECORDED payments. It cancels a `PENDING_PAYMENT` subscription it created. **Void payment:** reverses `amountPaid` and status. It does **not** auto-suspend; the lifecycle job catches up at the next period check.

### 5.6 Plan change (§1 Q5)

- **Same type only.** STREAM ↔ SERVER is a cancel plus a new subscription, for the same reason the plan's own type is immutable.
- **Downgrade** (lower limit or price): sets `pendingPlanId`, which applies at renewal. It is rejected if the new limit is below the streams in use, with the same message as `assertLimitCoversUsage`.
- **Upgrade:** creates a `PLAN_CHANGE` invoice for a full new period starting now, and applies when paid. The old period's unused days are not credited in this phase.

---

## 6. Money

- **All arithmetic on the backend**, using Prisma `Decimal` (decimal.js). Never JS `number` until serialisation. The client's totals are a preview only and are never trusted.
- Per line: `net = quantity × unitPrice − discount` (`0 ≤ discount ≤ qty×price`). `tax = PERCENTAGE ? round2(net × value / 100) : FIXED ? value × quantity`. `lineTotal = net + tax`.
- **Rounding:** half-up to 2 decimals **per line**. Invoice totals are sums of the rounded lines, so the printed lines always add up to the printed total.
- Serialised as numbers, the same as `serializePlan`.
- **Tax rows:** one tax type per line (the model has no compound tax). Splitting GST into CGST+SGST lines is out of scope; the existing tax types are single-rate.

Pure functions (`addDuration`, `computeLine`, `computeTotals`, `nextState(subscription, now, settings, paid)`) are the §13 test targets.

---

## 7. Enforcing plan limits on streams

| Plan field | Enforcement | Phase |
|---|---|---|
| `maxStreams` / `maxServerStream` | `TenantCustomerServer.streamLimit`. **Existing code, nothing new** | 2 |
| Dedicated (SERVER) | `isDedicated` + `assertServerFreeForDedication`. Existing | 2 |
| `playbackProtocols` | Clamp the stream's `protocols` to a **whitelist** of the plan's set on create/update for streams under a managed assignment. **The whitelist flag inverts meaning** (stream plan §4.4): the clamp must set `whitelist: true`, never just toggle the listed protocols | 7 |
| `maxPlaySession` | Needs a per-stream concurrent-session cap on the streaming server. **Verify the exact `stream_config` key against the live OpenAPI schema before building**, as the stream plan did. Mapping it changes `configHash` for affected streams | 7 |

Phase 7 is deliberately last. It touches the stream config mapper, which has the highest blast radius in the codebase.

---

## 8. Permissions

Added to `MODULES` in `prisma/seed.ts` and granted to `TENANT_ADMIN`; `SUPER_ADMIN` gets them automatically.

| Module | Actions | Notes |
|---|---|---|
| `tenant-subscriptions` | `list`, `view`, `create`, `renew`, `change_plan`, `cancel`, `suspend`, `resume` | `suspend`/`resume` are manual overrides of the job; separate from `update` because they cut service |
| `tenant-invoices` | `list`, `view`, `create`, `issue`, `void`, `add_discount` | `void` and `add_discount` are separate: both change what the customer owes |
| `tenant-payments` | `list`, `view`, `create`, `void` | |
| `tenant-billing-settings` | `view`, `update` | |
| `tenant-billing` | `view_dashboard` | The overview page's revenue figures |

The customer portal uses **no permissions**, only ownership scoping, consistent with `CustomerPortalService`.

---

## 9. API surface

**One backend module, `tenant-billing/`**, holding `SubscriptionsService`, `InvoicesService`, `PaymentsService`, `BillingSettingsService`, `BillingLifecycleService` and `billing-math.ts`. Subscriptions create invoices, and payments activate subscriptions. Split into per-resource modules, that is a module cycle, the same problem that moved the sync endpoints in the stream plan (§11). It imports `TenantCustomerServersModule` and `TenantStreamsModule` (exporting their services if they don't already).

Tenant surface routes are shown below. Each has a system twin under `system/tenant-…`, and business IDs are never accepted in tenant bodies.

**Subscriptions** — `tenant/subscriptions`

| Method | Path | Permission |
|---|---|---|
| GET | `/` (filters: customer, plan, server, type, status, expiring within N days) | `list` |
| GET | `/:id` (includes invoices and period history) | `view` |
| POST | `/preview` (no write, returns the invoice that `create` would produce) | `create` |
| POST | `/` `{ customerId, planId, serverId, startAt?, taxTypeId?, discount?, autoRenew }` → subscription + DRAFT or ISSUED invoice | `create` |
| POST | `/:id/renew` (issue the next period's invoice now) | `renew` |
| POST | `/:id/change-plan` `{ planId }` | `change_plan` |
| POST | `/:id/cancel` `{ atPeriodEnd }` | `cancel` |
| POST | `/:id/suspend` \| `/:id/resume` | `suspend` \| `resume` |
| PATCH | `/:id` `{ autoRenew, remark }` | `create` |

**Invoices** — `tenant/invoices`: `GET /`, `GET /:id`, `POST /` (manual/adjustment invoice), `PATCH /:id` (DRAFT only), `POST /:id/issue`, `POST /:id/void`.
**Payments** — `tenant/payments`: `GET /`, `GET /:id`, `POST /` `{ invoiceId, paymentModeId, amount, paidAt, referenceNo }`, `POST /:id/void`.
**Settings** — `tenant/billing-settings`: `GET`, `PATCH`.
**Overview** — `GET tenant/billing/summary`: active subscriptions by type, due this week, overdue amount, collected this month, expiring in 7 days.

**Customer portal** — `customer/billing`:

| Method | Path | Returns |
|---|---|---|
| GET | `/subscriptions` | Own subscriptions: plan, server name, period end, status, days left |
| GET | `/invoices`, `/invoices/:id` | Own ISSUED / PARTIALLY_PAID / PAID / VOID invoices. **DRAFTs are never shown** |
| GET | `/payments` | Own RECORDED payments |
| GET | `/plans` | ACTIVE plans with `showCustomer = true`: `customerPrice`, and `orginalPrice` as a strike-through. **`resellerPrice` is never returned** |

Every endpoint gets full Swagger decorators with examples, as the project requires.

---

## 10. Frontend — page structure

### 10.1 Tenant portal

A new **Billing** sidebar section. *Subscription Plans* moves into it from Management.

```
Billing
├── Overview            /tenant/billing                       tenant-billing:view_dashboard
├── Subscriptions       /tenant/billing/subscriptions         tenant-subscriptions:list
│   └── detail          /tenant/billing/subscriptions/[id]
├── Invoices            /tenant/billing/invoices              tenant-invoices:list
│   ├── detail          /tenant/billing/invoices/[id]
│   └── print           /tenant/billing/invoices/[id]/print   (no shell, print CSS)
├── Payments            /tenant/billing/payments              tenant-payments:list
└── Subscription Plans  /tenant/subscription-plans            (existing page, moved in nav only)
Settings
└── Billing             /tenant/settings/billing              tenant-billing-settings:view
```

**Overview:** stat cards (active STREAM / SERVER subscriptions, overdue amount, collected this month, due in 7 days), plus two short tables: *Expiring soon* and *Overdue invoices*. Each row has a quick action.

**Subscriptions list:**
- `ResourceTable` columns: customer, plan + type badge, server, streams used / limit, period end with a "in 5 days" hint, and a status badge.
- Filters: type, status, plan, server, expiring.
- Row actions: view, renew, change plan, cancel, suspend/resume.

**New subscription dialog.** This is the core flow. Each step narrows the next:
1. **Customer** (combobox).
2. **Type** (STREAM / SERVER tabs).
3. **Plan.** Cards show limits, duration, price and features, filtered by type, ACTIVE only.
4. **Server.**
   - STREAM plans list shared servers.
   - SERVER plans list only servers with no other customer assignments; unavailable ones are shown disabled with the reason.
   - A server the customer is already subscribed on is disabled, with a link to that subscription.
5. **Terms:** start date, tax type (default from settings), discount (gated), auto-renew.
6. **Preview**, from `POST /preview`: line, tax, total and the period dates.
7. **Create**, then optionally *Record payment now*.

**Subscription detail:**
- Header: status, period and days left.
- Terms snapshot card: "Plan changed since purchase" when it differs from the live plan.
- Usage: streams used / limit, linking to the customer's streams.
- Invoices table and period timeline.
- Action bar gated per permission.

**Invoice detail:**
- The invoice laid out as the customer sees it: billed from/to, lines, tax, totals, paid, balance, and an overdue badge.
- Actions: Issue (DRAFT), Record payment (dialog with mode, amount pre-filled to balance, date, reference), Void, Print.
- A payments list with void per payment.

**Payments:** a ledger table filtered by date range, mode and customer, with a footer total for the filtered set.

**Billing settings:** a single form (currency, invoice prefix, next number read-only after the first issue, due days, renewal lead days, grace days, activate on, default tax, footer). Same shape as the Mail Config page.

**Cross-page changes:**
- *Customer Servers* page: a "Managed by subscription" badge, with limit/dedicated/delete locked on managed rows.
- *Customers* detail: a Subscriptions & balance section.

### 10.2 Customer portal

The nav gets **My Billing** → `/customer/billing`, a single page with three tabs:
- **Subscriptions:** cards per subscription (plan, server, "Renews on" / "Expired", days left bar, and a renew banner when PAST_DUE or SUSPENDED, e.g. "contact your provider" until a gateway exists).
- **Invoices:** list with status, opening a read-only invoice with Print.
- **Plans:** catalogue cards (price, strike-through original, duration, limits, features).

*My Servers* also shows suspended assignments greyed with "Suspended — renew", instead of hiding them (today `listServers` filters to ACTIVE only).

### 10.3 System dashboard

Read-mostly twins: `/system/dashboard/tenant-subscriptions`, `/tenant-invoices`, `/tenant-payments`, with a business filter. Actions go through the same services and permissions as the tenant surface.

### 10.4 Shared frontend pieces

- `lib/money.ts` — `formatMoney(amount, currency)` via `Intl.NumberFormat`.
- `lib/billing-types.ts` — row types and status → badge variant maps, one place for labels.
- `components/billing/plan-card.tsx`, `invoice-document.tsx` (shared by tenant detail, print, and the customer view), `record-payment-dialog.tsx`, `subscription-status-badge.tsx`.
- Vendor-neutral naming throughout, as in every existing page.

---

## 11. Sequencing

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Confirm §1 decisions; decide on the test runner (Q11) | — |
| 1 | Schema (§4) + `db push`, permissions seed, `tenant-billing` module skeleton, billing settings API + page, `billing-math.ts` with tests — **done**. Only `tenant-billing-settings:*` is seeded; each later phase seeds the §8 permissions it gates, so the Roles UI never lists a permission that controls nothing | 0 |
| 2 | Subscriptions: preview/create, snapshot, assignment write-through, managed-assignment lock on the Customer Servers page, subscriptions list/detail pages, *New subscription* dialog | 1 |
| 3 | Invoices + payments: issue with numbering, record/void payment → activation, invoice detail + print, payments ledger, Overview page | 2 |
| 4 | Lifecycle: `@nestjs/schedule`, renewal invoices, PAST_DUE / SUSPENDED, suspend/resume with `suspendedStreamIds`, manual suspend/resume, cancel | 3 |
| 5 | Change plan (upgrade now / scheduled downgrade) | 4 |
| 6 | Customer portal billing page + suspended state on *My Servers* | 3 (4 for states) |
| 7 | `playbackProtocols` clamp and `maxPlaySession` (after live schema check) | 2 |
| 8 | System dashboard billing pages | 3 |

Each phase ends with a README/CHANGELOG bump and `graphify update .`, per the project conventions.

---

## 12. Explicitly out of scope

- **Payment gateway / online checkout / customer self-purchase** (§1 Q4, Q6).
- **Proration, credit balances, overpayment, refunds.** A mistaken payment is voided and re-recorded.
- **Reseller billing** (§1 Q7).
- **Compound / split taxes** (CGST+SGST), and multi-currency within one business.
- **Email / SMS invoice delivery and expiry reminders.** A natural next step using `TenantMailConfig`, planned separately.
- **Renaming `orginalPrice`.**
- **Usage-based billing** (bandwidth, viewer-hours). Plans are flat-priced.

---

## 13. Verification

- **Period math:** month-end clamping (Jan 31, Feb 29 leap/non-leap, Dec → Jan), YEAR from Feb 29, DAY across DST-free and DST zones, computed in `APP_TIMEZONE`.
- **Money:** per-line half-up rounding. Printed lines sum to the total. PERCENTAGE vs FIXED × quantity. Discount bounds. No float leaks (e.g. `0.1 + 0.2` cases).
- **Invoice numbering:** 20 concurrent issues on one business produce 20 distinct consecutive numbers with no gaps. Drafts consume none.
- **Renewal idempotency:** running the job twice, or in two processes, produces exactly one renewal invoice per period (the unique constraint).
- **State machine:** `nextState` is a pure function tested over every transition in §5.1, including paying during grace, paying after suspension (the new period starts at the payment), and cancel-at-period-end.
- **Suspend/resume:** a customer-disabled stream stays disabled after resume. A stream deleted while suspended is skipped. An unreachable server leaves `PENDING_PUSH` and still records the suspension.
- **Grant rules:** a SERVER plan on a shared server is refused. A downgrade below usage is refused. A second live subscription on the same (customer, server) is refused. The managed assignment cannot be edited from Customer Servers.
- **Scoping:** a tenant cannot read another business's invoices. A customer cannot read another customer's invoices or any DRAFT. `resellerPrice` never appears in customer responses.
- **Payment atomicity:** a failed assignment write still commits the payment and surfaces the error.
- **Manual end-to-end** on a local DB for each phase. Phase 7 is verified against a live streamer only with explicit go-ahead, since it mutates production stream config.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Plan edit silently changes sold subscriptions | Snapshot at purchase (§4.2) |
| Double-billing from job overlap or retries | `@@unique([tenantSubscriptionId, periodStart])` + run lock (§5.3) |
| Invoice number gaps or duplicates | Locked counter in the issue transaction; drafts unnumbered (§5.5) |
| Rounding mismatch between lines and total | Decimal only, per-line rounding, totals are sums (§6) |
| Resume re-enables streams the customer turned off | `suspendedStreamIds` (§5.4) |
| Subscription and manual assignment edits fight | Managed assignments locked on the Customer Servers page (§3) |
| Month arithmetic drift (Jan 31 → Mar 3) | Clamped `addDuration`, tested (§13) |
| Payment recorded but grant fails | Payment commits; subscription stays pending with a visible error (§5.5) |
| Protocol clamp inverts playback access | Always sets `whitelist: true`; tested both ways; last phase (§7) |
| Suspension cuts live viewers unexpectedly | Grace period + PAST_DUE banner before SUSPENDED; manual resume permission |
| Module cycle between subscriptions / invoices / payments | Single `tenant-billing` module (§9) |
