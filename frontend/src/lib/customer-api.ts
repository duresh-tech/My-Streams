/**
 * API client for the customer portal, parallel to lib/tenant-api.ts.
 *
 * Namespaced separately (its own token key, CSRF cookie and refresh path) so a
 * customer session, a tenant session and a system-admin session can coexist in
 * one browser without clobbering each other - which matters for the "Login as
 * customer" flow, where a tenant admin holds both at once.
 */

import { readStored, removeStored, writeStored } from "@/lib/storage";
import type { InvoiceStatus, ServiceBilling, StreamAccess } from "@/lib/billing";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const CUSTOMER_ACCESS_TOKEN_KEY = "customer.accessToken";

export function getCustomerAccessToken(): string | null {
  return readStored(CUSTOMER_ACCESS_TOKEN_KEY);
}

export function setCustomerAccessToken(token: string | null) {
  if (token) writeStored(CUSTOMER_ACCESS_TOKEN_KEY, token);
  else removeStored(CUSTOMER_ACCESS_TOKEN_KEY);
}

function getCustomerCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)customer_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class CustomerApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  csrf?: boolean;
  retryOn401?: boolean;
}

export async function customerApi<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true, csrf = false, retryOn401 = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-type": "website",
  };
  if (auth) {
    const token = getCustomerAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (csrf) {
    const csrfToken = getCustomerCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retryOn401) {
    const refreshed = await tryCustomerRefresh();
    if (refreshed) {
      return customerApi<T>(path, { ...options, retryOn401: false });
    }
    setCustomerAccessToken(null);
    if (typeof window !== "undefined") {
      window.location.href = "/customer/login";
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && Array.isArray(data.errors) && data.errors.length > 0
        ? data.errors
            .map((issue: { path?: (string | number)[]; message: string }) =>
              issue.path && issue.path.length > 0
                ? `${issue.path.join(".")}: ${issue.message}`
                : issue.message,
            )
            .join("; ")
        : undefined) ||
      (data && (Array.isArray(data.message) ? data.message[0] : data.message)) ||
      `Request failed (${response.status})`;
    throw new CustomerApiError(response.status, message, data);
  }
  return data as T;
}

/**
 * Uploads the profile picture as multipart.
 *
 * Separate from customerApi() because that one always sends JSON: setting a
 * Content-Type here would override the boundary the browser generates and the
 * server would fail to parse the body.
 */
export async function uploadCustomerPicture(file: File): Promise<CustomerProfileDetails & { bytes: number }> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = { "x-device-type": "website" };
  const token = getCustomerAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/customer/profile/picture`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message[0] : data.message)) ||
      `Upload failed (${response.status})`;
    throw new CustomerApiError(response.status, message, data);
  }
  return data as CustomerProfileDetails & { bytes: number };
}

async function tryCustomerRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/customer/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-type": "website" },
      credentials: "include",
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (data?.accessToken) {
      setCustomerAccessToken(data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ---------- Typed API shapes ----------

export interface CustomerProfile {
  id: string;
  systemCode: string;
  customerCode: string;
  username: string | null;
  fName: string;
  lName: string | null;
  email: string | null;
  primaryMobile: string;
  status: string;
  allowPortalAccess: boolean;
  /** True when a tenant admin is signed in as this customer. */
  impersonated?: boolean;
}

export interface CustomerLoginResponse {
  customer: CustomerProfile;
  redirectTo: string;
  accessToken: string;
  csrfToken: string;
  impersonated?: boolean;
}

/** The customer's own record, as the portal may show and edit it. */
export interface CustomerProfileDetails {
  id: string;
  systemCode: string;
  customerCode: string;
  username: string | null;
  /** Set by the provider; not editable here. */
  fName: string;
  lName: string | null;
  fatherName: string | null;
  gender: "MALE" | "FEMALE" | "TRANSGENDER" | "NOT_TO_SAY" | "NONE";
  /** Plain YYYY-MM-DD, with no timezone applied. */
  dateOfBirth: string | null;
  primaryMobile: string;
  secondaryMobile: string | null;
  email: string | null;
  customerType: string;
  place: string | null;
  street: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Storage path, not a URL. */
  customerPicture: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  taxType: string | null;
  taxNumber: string | null;
  status: string;
  allowPortalAccess: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerCredentialsResult {
  success: boolean;
  usernameChanged: boolean;
  passwordChanged: boolean;
  /** Always true: every session ends, so the client must sign in again. */
  signedOut: boolean;
}

export interface CustomerServer {
  assignmentId: string;
  serverId: string;
  name: string;
  serverStatus: string;
  connectionStatus: string;
  isDedicated: boolean;
  streamLimit: number | null;
  streamsUsed: number;
  /** Null when the quota is unlimited. */
  streamsRemaining: number | null;
  /** Requires the server to be ACTIVE and the quota to have room. */
  canCreateStream: boolean;
  /** Requires the server to be ACTIVE; connectivity is what is being tested. */
  canCheckConnection: boolean;
  /** The server plan on this assignment; null when it is not billed. */
  billing: ServiceBilling | null;
}

export interface CustomerStreamInput {
  id?: string;
  priority?: number;
  url: string;
  comment?: string | null;
  sourceTimeout?: number | null;
}

export interface CustomerStream {
  id: string;
  systemCode: string;
  serverId: string;
  applicationName: string | null;
  streamKey: string;
  name: string;
  title: string;
  disabled: boolean;
  status: string;
  protocols: { whitelist: boolean } & Record<string, boolean>;
  /** Public share identity; null only for rows predating the backfill. */
  shareCode: string | null;
  inputs: CustomerStreamInput[];
  server?: {
    id: string;
    name: string;
    /** ACTIVE is required before a stream can be edited, toggled or reloaded. */
    status?: string;
    connectionStatus?: string;
  };
  /** Only on the list: the stream's own plan, or the server plan covering it. */
  billing?: ServiceBilling | null;
  /** BLOCKED refuses edit, enable, reload and delete until the stream is billed. */
  access?: StreamAccess;
}

export interface CustomerInvoiceSummary {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  currency: string;
  issueDate: number | null;
  dueDate: number | null;
  description: string | null;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  isOverdue: boolean;
}

export interface CustomerInvoiceParty {
  name: string;
  customerCode?: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  taxNumber?: string | null;
}

export interface CustomerInvoiceDetail extends Omit<CustomerInvoiceSummary, "description"> {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  billedTo: CustomerInvoiceParty | null;
  billedFrom: CustomerInvoiceParty | null;
  notes: string | null;
  voidedAt: number | null;
  items: {
    id: string;
    description: string;
    periodStart: number | null;
    periodEnd: number | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxName: string | null;
    taxAmount: number;
    lineTotal: number;
  }[];
  payments: { id: string; amount: number; paidAt: number; referenceNo: string | null; paymentMode: string }[];
}

export interface CustomerProtocolUrl {
  protocol: string;
  label: string;
  url: string;
}

export interface CustomerStreamView {
  stream: CustomerStream;
  live: boolean;
  liveError: string | null;
  stats: Record<string, unknown> | null;
  mediaInfo: { tracks?: Array<Record<string, unknown>> } | null;
  urls: {
    inputs: CustomerProtocolUrl[];
    outputs: CustomerProtocolUrl[];
    host: string;
    scheme: string;
    webPort: number;
  };
}

export interface CustomerSession {
  id: string;
  proto?: string;
  ip?: string;
  country?: string;
  user_agent?: string;
  bytes?: number;
  opened_at?: number;
}
