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
  /**
   * The backend's APP_TIMEZONE. Served from here rather than a frontend env
   * var so the two cannot disagree about what zone a timestamp is in.
   */
  timezone: string | null;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_URL}/system/app-settings/public/branding`, {
    headers: { "x-device-type": "website" },
  });
  if (!response.ok) throw new Error("Failed to load app settings");
  const data = await response.json();
  return {
    appName: data.appName,
    logoPath: data.logoPath ?? null,
    timezone: data.timezone ?? null,
  };
}
