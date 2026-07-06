"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, getAccessToken, setAccessToken, type SessionUser } from "@/lib/api";

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  hasPermission: (permissionKey: string) => boolean;
}

/** Client-side auth guard: loads /system/me, bounces to login on failure. */
export function useSession(): SessionState {
  const router = useRouter();
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getAccessToken()) {
        router.replace("/system/login");
        return;
      }
      try {
        const me = await api<SessionUser>("/system/me");
        if (!cancelled) {
          setUser(me);
          setLoading(false);
        }
      } catch {
        if (!cancelled) router.replace("/system/login");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = React.useCallback(async () => {
    try {
      await api("/system/logout", { method: "POST", csrf: true, retryOn401: false });
    } catch {
      // best effort; clear local state regardless
    }
    setAccessToken(null);
    router.replace("/system/login");
  }, [router]);

  const hasPermission = React.useCallback(
    (permissionKey: string) => user?.permissions?.includes(permissionKey) ?? false,
    [user],
  );

  return { user, loading, logout, hasPermission };
}
