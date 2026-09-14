/**
 * Thin API client for the tenant-facing backend, parallel to lib/api.ts.
 * Namespaced (token key, CSRF cookie, refresh/login paths) so a tenant
 * session and a system-admin session can coexist in the same browser
 * without clobbering each other.
 */

import { readStored, removeStored, writeStored } from "@/lib/storage";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const TENANT_ACCESS_TOKEN_KEY = "tenant.accessToken";

export function getTenantAccessToken(): string | null {
  return readStored(TENANT_ACCESS_TOKEN_KEY);
}

export function setTenantAccessToken(token: string | null) {
  if (token) writeStored(TENANT_ACCESS_TOKEN_KEY, token);
  else removeStored(TENANT_ACCESS_TOKEN_KEY);
}

function getTenantCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)tenant_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class TenantApiError extends Error {
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

export async function tenantApi<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    csrf = false,
    retryOn401 = true,
  } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-type": "website",
  };
  if (auth) {
    const token = getTenantAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (csrf) {
    const csrfToken = getTenantCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retryOn401) {
    const refreshed = await tryTenantRefresh();
    if (refreshed) {
      return tenantApi<T>(path, { ...options, retryOn401: false });
    }
    setTenantAccessToken(null);
    if (typeof window !== "undefined") {
      window.location.href = "/tenant/login";
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
    throw new TenantApiError(response.status, message, data);
  }
  return data as T;
}

/** Uploads the tenant user's own profile picture and returns its stored path. */
export async function uploadTenantAvatar(file: File): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = { "x-device-type": "website" };
  const token = getTenantAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/tenant/account/avatar`, {
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
    throw new TenantApiError(response.status, message, data);
  }
  return data as { path: string };
}

/** Uploads the tenant user's own business logo and returns its stored path. */
export async function uploadTenantBusinessLogo(file: File): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = { "x-device-type": "website" };
  const token = getTenantAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/tenant/business/logo`, {
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
    throw new TenantApiError(response.status, message, data);
  }
  return data as { path: string };
}

/** Generic file upload for any tenant self-service feature. Returns the stored path. */
export async function uploadTenantFile(file: File): Promise<{ path: string; driver: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = { "x-device-type": "website" };
  const token = getTenantAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/tenant/uploads`, {
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
    throw new TenantApiError(response.status, message, data);
  }
  return data as { path: string; driver: string };
}

async function tryTenantRefresh(): Promise<boolean> {
  try {
    const csrfToken = getTenantCsrfToken();
    if (!csrfToken) return false;
    const response = await fetch(`${API_URL}/tenant/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-type": "website",
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (data?.accessToken) {
      setTenantAccessToken(data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ---------- Typed API shapes ----------

export interface TenantSessionUser {
  id: string;
  systemCode?: string;
  fName?: string;
  username: string;
  email: string;
  roleId: string;
  roleKey?: string;
  role?: { id: string; roleKey: string; displayName: string };
  permissions?: string[];
}

export interface TenantLoginResponse {
  user: TenantSessionUser;
  permissions: string[];
  accessToken: string;
  csrfToken: string;
  redirectTo: string;
}

export interface TenantDashboardStats {
  businesses: number;
}

export interface TenantAccountProfile {
  id: string;
  systemCode: string;
  fName: string;
  username: string;
  email: string;
  phone: string | null;
  avatarPath: string | null;
  roleId: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  createdAt: number;
  updatedAt: number;
  role?: { id: string; roleKey: string; displayName: string };
}

export interface TenantBusinessProfile {
  id: string;
  systemCode: string;
  name: string;
  tagLine: string | null;
  email: string;
  phone: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  logoPath: string | null;
  taxNumber: string | null;
  isParentBusiness: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";
  createdAt: number;
  updatedAt: number;
}
