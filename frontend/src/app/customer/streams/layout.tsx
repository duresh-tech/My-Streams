import { CustomerShell } from "@/components/customer-shell";

export default function CustomerStreamsLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
