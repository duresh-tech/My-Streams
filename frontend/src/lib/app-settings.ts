/**
 * Public, unauthenticated fetch for app-wide branding (name/logo). Used by
 * both the system dashboard and tenant settings UI, so it intentionally
 * avoids the authenticated api()/tenantApi() clients.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export interface AppSettings {
  appName: string;
  logoPath: string | null;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_URL}/system/app-settings/public/branding`, {
    headers: { "x-device-type": "website" },
  });
  if (!response.ok) throw new Error("Failed to load app settings");
  const data = await response.json();
  return { appName: data.appName, logoPath: data.logoPath ?? null };
}

export interface Dq12Assets {
  welcome: string | null;
  success: string | null;
  pending: string | null;
  fail: string | null;
  cancel: string | null;
  qrBackground: string | null;
}

/** Background images for the Bonrix DQ12 display, configured via the App
 * Settings qr_device.dq12.* keys. Any key left unconfigured comes back null -
 * callers fall back to a plain dark screen with label text. */
export async function fetchDq12Assets(): Promise<Dq12Assets> {
  const response = await fetch(`${API_URL}/system/app-settings/public/dq12-assets`, {
    headers: { "x-device-type": "website" },
  });
  if (!response.ok) throw new Error("Failed to load DQ12 display assets");
  return response.json();
}
