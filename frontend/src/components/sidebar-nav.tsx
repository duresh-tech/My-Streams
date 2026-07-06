"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/system/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/system/dashboard/users", label: "System Users", icon: Users, permission: "system-users:read" },
  { href: "/system/dashboard/roles", label: "Roles", icon: ShieldCheck, permission: "roles:read" },
  { href: "/system/dashboard/permissions", label: "Permissions", icon: KeyRound, permission: "permissions:read" },
];

interface SidebarNavProps {
  onNavigate?: () => void;
  hasPermission?: (permissionKey: string) => boolean;
}

export function SidebarNav({ onNavigate, hasPermission }: SidebarNavProps) {
  const pathname = usePathname();
  const items = hasPermission
    ? NAV_ITEMS.filter((item) => hasPermission(item.permission))
    : NAV_ITEMS;

  return (
    <nav className="grid gap-1 px-2">
      {items.map((item) => {
        const active =
          item.href === "/system/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
