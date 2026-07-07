"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Building,
  Building2,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Mail,
  Network,
  Palette,
  Percent,
  ShieldCheck,
  UserCog,
  Users,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
  /** Groups items under a section header. Items without one render ungrouped at the top. */
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/system/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/system/dashboard/users", label: "System Users", icon: Users, permission: "system-users:read" },
  { href: "/system/dashboard/tenant-users", label: "Tenant Users", icon: UserCog, permission: "tenant-users:read" },
  { href: "/system/dashboard/tenant-business", label: "Tenant Business", icon: Building2, permission: "tenant-business:list" },
  { href: "/system/dashboard/tenant-mapped-business", label: "Tenant Mapped Business", icon: Network, permission: "tenant-mapped-business:list" },
  { href: "/system/dashboard/tenant-business-branches", label: "Business Branches", icon: Building, permission: "tenant-business-branches:list" },
  { href: "/system/dashboard/tenant-network-providers", label: "Network Providers", icon: Wifi, permission: "tenant-network-providers:list" },
  { href: "/system/dashboard/tenant-tax-types", label: "Tax Types", icon: Percent, permission: "tenant-tax-types:list" },
  { href: "/system/dashboard/tenant-payment-modes", label: "Payment Modes", icon: CreditCard, permission: "tenant-payment-modes:list" },
  { href: "/system/dashboard/tenant-in-ex-categories", label: "Income & Expense Categories", icon: ArrowLeftRight, permission: "tenant-in-ex-categories:list" },
  { href: "/system/dashboard/tenant-mail-config", label: "Mail Config", icon: Mail, permission: "tenant-mail-config:list" },
  { href: "/system/dashboard/roles", label: "Roles", icon: ShieldCheck, permission: "roles:read" },
  { href: "/system/dashboard/permissions", label: "Permissions", icon: KeyRound, permission: "permissions:read" },
  { href: "/system/dashboard/settings/customization", label: "Customization", icon: Palette, permission: "system-settings:view", section: "Settings" },
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
      {items.map((item, index) => {
        const active =
          item.href === rootHref
            ? pathname === item.href
            : pathname.startsWith(item.href);
        const showSectionHeader = item.section && item.section !== items[index - 1]?.section;
        return (
          <React.Fragment key={item.href}>
            {showSectionHeader && (
              <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
                {item.section}
              </div>
            )}
            <Link
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
          </React.Fragment>
        );
      })}
    </nav>
  );
}
