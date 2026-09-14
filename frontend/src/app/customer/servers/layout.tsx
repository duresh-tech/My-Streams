import { CustomerShell } from "@/components/customer-shell";

export default function CustomerServersLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
