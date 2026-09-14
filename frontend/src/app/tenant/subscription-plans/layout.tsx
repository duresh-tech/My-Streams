import { TenantShell } from "@/components/tenant-shell";

export default function TenantSubscriptionPlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
