"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  getTenantAccessToken,
  setTenantAccessToken,
  tenantApi,
  type TenantSessionUser,
} from "@/lib/tenant-api";

interface TenantSessionState {
  user: TenantSessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  hasPermission: (permissionKey: string) => boolean;
}

/** Client-side tenant auth guard: loads /tenant/me, bounces to tenant login on failure. */
export function useTenantSession(): TenantSessionState {
  const router = useRouter();
  const [user, setUser] = React.useState<TenantSessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getTenantAccessToken()) {
        router.replace("/tenant/login");
        return;
      }
      try {
        const me = await tenantApi<TenantSessionUser>("/tenant/me");
        if (!cancelled) {
          setUser(me);
          setLoading(false);
        }
      } catch {
        if (!cancelled) router.replace("/tenant/login");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = React.useCallback(async () => {
    try {
      await tenantApi("/tenant/logout", { method: "POST", csrf: true, retryOn401: false });
    } catch {
      // best effort; clear local state regardless
    }
    setTenantAccessToken(null);
    router.replace("/tenant/login");
  }, [router]);

  const hasPermission = React.useCallback(
    (permissionKey: string) => user?.permissions?.includes(permissionKey) ?? false,
    [user],
  );

  return { user, loading, logout, hasPermission };
}
