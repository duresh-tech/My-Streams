"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeftRight, Building, Building2, CreditCard, Mail, MapPin, Percent, QrCode, Route, Store, User, Wifi } from "lucide-react";

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
  { href: "/tenant/settings/business-information", label: "Business Information", icon: Building2, permission: "tenant-business:view" },
  { href: "/tenant/settings/business-branches", label: "Business Branches", icon: Building, permission: "tenant-business-branches:list" },
  { href: "/tenant/settings/network-providers", label: "Network Providers", icon: Wifi, permission: "tenant-network-providers:list" },
  { href: "/tenant/settings/tax-types", label: "Tax Types", icon: Percent, permission: "tenant-tax-types:list" },
  { href: "/tenant/settings/payment-modes", label: "Payment Modes", icon: CreditCard, permission: "tenant-payment-modes:list" },
  { href: "/tenant/settings/in-ex-categories", label: "Income & Expense Categories", icon: ArrowLeftRight, permission: "tenant-in-ex-categories:list" },
  { href: "/tenant/settings/mail-config", label: "Mail Config", icon: Mail, permission: "tenant-mail-config:list" },
  { href: "/tenant/settings/places", label: "Places", icon: MapPin, permission: "tenant-places:list" },
  { href: "/tenant/settings/streets", label: "Streets", icon: Route, permission: "tenant-streets:list" },
  { href: "/tenant/settings/counters", label: "Counters", icon: Store, permission: "tenant-counters:list" },
  { href: "/tenant/settings/qr-devices", label: "QR Devices", icon: QrCode, permission: "tenant-qr-devices:list" },
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
