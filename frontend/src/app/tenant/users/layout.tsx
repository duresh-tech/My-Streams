import { TenantShell } from "@/components/tenant-shell";

export default function TenantUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
