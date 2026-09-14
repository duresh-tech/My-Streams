import { TenantShell } from "@/components/tenant-shell";

export default function TenantStreamingServersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
