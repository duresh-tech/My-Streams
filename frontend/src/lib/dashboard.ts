/** Types and formatting shared by the system and tenant dashboards. */

import type { BillFor, InvoiceStatus } from "@/lib/billing";

export type DashboardRange = "30d" | "90d" | "12m";

export const DASHBOARD_RANGES: { value: DashboardRange; label: string; description: string }[] = [
  { value: "30d", label: "30 days", description: "last 30 days" },
  { value: "90d", label: "90 days", description: "last 13 weeks" },
  { value: "12m", label: "12 months", description: "last 12 months" },
];

export interface DashboardBucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

export interface TenantOverview {
  range: DashboardRange;
  generatedAt: number;
  buckets: DashboardBucket[];
  billing: null | {
    currency: string;
    collected: number;
    collectedSeries: number[];
    outstanding: number;
    openCount: number;
    overdueAmount: number;
    overdueCount: number;
    invoiceStatus: { status: InvoiceStatus; count: number }[];
    expiringSoon: {
      id: string;
      planName: string;
      subscriptionFor: BillFor;
      currentPeriodEnd: number;
      customer: string;
      target: string;
    }[];
  };
  streams: null | {
    total: number;
    enabled: number;
    billingOff: number;
    disabledByUser: number;
    exempt: number;
    perServer: { name: string; enabled: number; disabled: number }[];
    servers: null | {
      total: number;
      connected: number;
      unreachable: number;
      unauthorized: number;
      unknown: number;
      attention: { id: string; name: string; status: string; connectionStatus: string }[];
    };
  };
  customers: null | {
    total: number;
    active: number;
    newInRange: number;
    newSeries: number[];
    withActiveBill: number;
    withoutActiveBill: number;
  };
  events: null | {
    total: number;
    series: { SOURCE: number[]; STREAM: number[]; VIEWER: number[] };
    alerts: { sent: number; failed: number; cooldown: number; noMailConfig: number };
  };
  incomeExpense: null | {
    currency: string;
    income: number;
    expense: number;
    net: number;
    incomeSeries: number[];
    expenseSeries: number[];
  };
}

export interface SystemOverview {
  range: DashboardRange;
  generatedAt: number;
  buckets: DashboardBucket[];
  growth: {
    businesses: number;
    tenantUsers: number;
    customers: number;
    businessesSeries: number[];
    tenantUsersSeries: number[];
    customersSeries: number[];
    topBusinesses: { id: string; name: string; customers: number; streams: number }[];
  };
  infrastructure: {
    servers: { total: number; active: number; connected: number; unreachable: number; unauthorized: number; unknown: number };
    streams: { total: number; enabled: number; billingOff: number; disabled: number };
    attention: { id: string; name: string; business: string; status: string; connectionStatus: string }[];
  };
  billing: {
    currency: string;
    invoices: number;
    invoicesSeries: number[];
    collected: number;
    collectedSeries: number[];
    outstanding: number;
  }[];
  access: {
    users: number;
    activeUsers: number;
    roles: number;
    permissions: number;
    activeSessions: number;
    activeTenantSessions: number;
    activeCustomerSessions: number;
    systemUsersSeries: number[];
    tenantUsersSeries: number[];
  };
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();

/** 1,284 -> 1.3K; for axis ticks. */
export function formatCompact(value: number): string {
  return compact.format(value);
}

export function formatCount(value: number): string {
  return whole.format(value);
}

/** Buckets and one or more aligned series, as rows for a chart. */
export function toRows(buckets: DashboardBucket[], series: Record<string, number[]>): Record<string, string | number>[] {
  return buckets.map((bucket, i) => {
    const row: Record<string, string | number> = { label: bucket.label };
    for (const [key, values] of Object.entries(series)) row[key] = values[i] ?? 0;
    return row;
  });
}
