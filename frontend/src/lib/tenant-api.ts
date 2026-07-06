/**
 * Thin API client for the tenant-facing backend, parallel to lib/api.ts.
 * Namespaced (token key, CSRF cookie, refresh/login paths) so a tenant
 * session and a system-admin session can coexist in the same browser
 * without clobbering each other.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const TENANT_ACCESS_TOKEN_KEY = "tenant.accessToken";

export function getTenantAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TENANT_ACCESS_TOKEN_KEY);
}

export function setTenantAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TENANT_ACCESS_TOKEN_KEY, token);
  else localStorage.removeItem(TENANT_ACCESS_TOKEN_KEY);
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
