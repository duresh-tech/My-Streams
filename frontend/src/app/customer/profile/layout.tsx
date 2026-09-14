import { CustomerShell } from "@/components/customer-shell";

export default function CustomerProfileLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
