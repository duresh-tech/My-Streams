"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SETTINGS_NAV_ITEMS = [
  { href: "/tenant/settings/user-account", label: "Account Settings", icon: User },
];

export function TenantSettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = SETTINGS_NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  return (
    <div className="w-full shrink-0 md:w-64">
      {/* Mobile: dropdown */}
      <div className="md:hidden">
        <Select value={active?.href} onValueChange={(href) => router.push(href)}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Settings" />
          </SelectTrigger>
          <SelectContent>
            {SETTINGS_NAV_ITEMS.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: vertical list */}
      <nav className="hidden rounded-xl border bg-card p-2 md:grid md:gap-1">
        {SETTINGS_NAV_ITEMS.map((item) => {
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
