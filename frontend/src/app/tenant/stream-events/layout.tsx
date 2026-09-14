import { TenantShell } from "@/components/tenant-shell";

export default function TenantStreamEventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantShell>{children}</TenantShell>;
}
