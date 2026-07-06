/**
 * Thin API client for the system backend.
 * - Adds the mandatory x-device-type header
 * - Attaches the JWT access token
 * - Sends cookies (refresh token / CSRF) with credentials: "include"
 * - Transparently refreshes the access token once on 401
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const ACCESS_TOKEN_KEY = "system.accessToken";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
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

export async function api<T = unknown>(
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
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (csrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retryOn401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api<T>(path, { ...options, retryOn401: false });
    }
    setAccessToken(null);
    if (typeof window !== "undefined") {
      window.location.href = "/system/login";
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message[0] : data.message)) ||
      `Request failed (${response.status})`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const csrfToken = getCsrfToken();
    if (!csrfToken) return false;
    const response = await fetch(`${API_URL}/system/refresh`, {
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
      setAccessToken(data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ---------- Typed API shapes ----------

export interface SessionUser {
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

export interface LoginResponse {
  user: SessionUser;
  permissions: string[];
  accessToken: string;
  csrfToken: string;
  redirectTo: string;
}

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListResponse<T> {
  items: T[];
  meta: ListMeta;
}

export interface DashboardStats {
  users: number;
  activeUsers: number;
  roles: number;
  permissions: number;
  activeSessions: number;
}
