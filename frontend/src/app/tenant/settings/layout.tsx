import { TenantShell } from "@/components/tenant-shell";

export default function TenantSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
