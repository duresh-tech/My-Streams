"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { CreditCard, Percent, Receipt, User } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantSession } from "@/hooks/use-tenant-session";

const SETTINGS_NAV_ITEMS = [
  { href: "/tenant/settings/user-account", label: "Account Settings", icon: User, permission: "tenant-account:view" },
  { href: "/tenant/settings/tax-types", label: "Tax Types", icon: Percent, permission: "tenant-tax-types:list" },
  { href: "/tenant/settings/payment-modes", label: "Payment Modes", icon: CreditCard, permission: "tenant-payment-modes:list" },
  { href: "/tenant/settings/expense-categories", label: "Expense Categories", icon: Receipt, permission: "tenant-expense-categories:list" },
];

export function TenantSettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useTenantSession();
  const items = SETTINGS_NAV_ITEMS.filter((item) => hasPermission(item.permission));
  const active = items.find((item) => pathname.startsWith(item.href));

  return (
    <div className="w-full shrink-0 md:w-64">
      {/* Mobile: dropdown */}
      <div className="md:hidden">
        <Select value={active?.href} onValueChange={(href) => router.push(href)}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Settings" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: vertical list */}
      <nav className="hidden rounded-xl border bg-card p-2 md:grid md:gap-1">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
