"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Building,
  Building2,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Network,
  Percent,
  Receipt,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/system/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/system/dashboard/users", label: "System Users", icon: Users, permission: "system-users:read" },
  { href: "/system/dashboard/tenant-users", label: "Tenant Users", icon: UserCog, permission: "tenant-users:read" },
  { href: "/system/dashboard/tenant-business", label: "Tenant Business", icon: Building2, permission: "tenant-business:list" },
  { href: "/system/dashboard/tenant-mapped-business", label: "Tenant Mapped Business", icon: Network, permission: "tenant-mapped-business:list" },
  { href: "/system/dashboard/tenant-business-branches", label: "Business Branches", icon: Building, permission: "tenant-business-branches:list" },
  { href: "/system/dashboard/tenant-tax-types", label: "Tax Types", icon: Percent, permission: "tenant-tax-types:list" },
  { href: "/system/dashboard/tenant-payment-modes", label: "Payment Modes", icon: CreditCard, permission: "tenant-payment-modes:list" },
  { href: "/system/dashboard/tenant-expense-categories", label: "Expense Categories", icon: Receipt, permission: "tenant-expense-categories:list" },
  { href: "/system/dashboard/roles", label: "Roles", icon: ShieldCheck, permission: "roles:read" },
  { href: "/system/dashboard/permissions", label: "Permissions", icon: KeyRound, permission: "permissions:read" },
];

interface SidebarNavProps {
  onNavigate?: () => void;
  hasPermission?: (permissionKey: string) => boolean;
  instanceId?: string;
  navItems?: NavItem[];
  rootHref?: string;
}

export function SidebarNav({
  onNavigate,
  hasPermission,
  instanceId = "default",
  navItems = NAV_ITEMS,
  rootHref = "/system/dashboard",
}: SidebarNavProps) {
  const pathname = usePathname();
  const items = hasPermission
    ? navItems.filter((item) => hasPermission(item.permission))
    : navItems;

  return (
    <nav className="grid gap-1 px-2">
      {items.map((item) => {
        const active =
          item.href === rootHref
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`active-nav-pill-${instanceId}`}
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <item.icon className="relative z-10 size-4" />
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
