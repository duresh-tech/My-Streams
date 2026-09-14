import { TenantShell } from "@/components/tenant-shell";

export default function TenantBillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
