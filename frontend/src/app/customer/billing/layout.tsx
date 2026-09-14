import { CustomerShell } from "@/components/customer-shell";

export default function CustomerBillingLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
