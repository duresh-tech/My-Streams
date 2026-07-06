import Link from "next/link";

import { TenantShell } from "@/components/tenant-shell";
import { TenantSettingsNav } from "@/components/tenant-settings-nav";

export default function TenantSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantShell>
      <div className="space-y-4">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/tenant/dashboard" className="font-medium text-foreground hover:underline">
            Home
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">Settings</span>
        </nav>

        <div className="flex flex-col gap-6 md:flex-row">
          <TenantSettingsNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </TenantShell>
  );
}
