import { TenantShell } from "@/components/tenant-shell";

export default function TenantCustomerServersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
