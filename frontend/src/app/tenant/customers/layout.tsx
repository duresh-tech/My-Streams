import { TenantShell } from "@/components/tenant-shell";

export default function TenantCustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
