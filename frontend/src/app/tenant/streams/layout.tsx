import { TenantShell } from "@/components/tenant-shell";

export default function TenantStreamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
