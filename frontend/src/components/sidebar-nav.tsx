"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Building2,
  Contact,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Mail,
  Network,
  Percent,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
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
  {
    href: "/system/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard:view",
    section: "Main",
  },
  {
    href: "/system/dashboard/users",
    label: "System Users",
    icon: Users,
    permission: "system-users:read",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-users",
    label: "Tenant Users",
    icon: UserCog,
    permission: "tenant-users:read",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-business",
    label: "Tenant Business",
    icon: Building2,
    permission: "tenant-business:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-mapped-business",
    label: "Mapped Business",
    icon: Network,
    permission: "tenant-mapped-business:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/streaming-servers",
    label: "Streaming Servers",
    icon: Server,
    permission: "tenant-streaming-servers:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-tax-types",
    label: "Tax Types",
    icon: Percent,
    permission: "tenant-tax-types:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-payment-modes",
    label: "Payment Modes",
    icon: CreditCard,
    permission: "tenant-payment-modes:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-in-ex-categories",
    label: "In & Ex Categories",
    icon: ArrowLeftRight,
    permission: "tenant-in-ex-categories:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-mail-config",
    label: "Mail Config",
    icon: Mail,
    permission: "tenant-mail-config:list",
    section: "Management",
  },
  {
    href: "/system/dashboard/tenant-customers",
    label: "Customers",
    icon: Contact,
    permission: "tenant-customers:view",
    section: "Management",
  },
  {
    href: "/system/dashboard/roles",
    label: "Roles",
    icon: ShieldCheck,
    permission: "roles:read",
    section: "Management",
  },
  {
    href: "/system/dashboard/permissions",
    label: "Permissions",
    icon: KeyRound,
    permission: "permissions:read",
    section: "Management",
  },
  {
    href: "/system/dashboard/app-settings",
    label: "App Settings",
    icon: SlidersHorizontal,
    permission: "app-settings:view",
    section: "Settings",
  },
];

interface SidebarNavProps {
  onNavigate?: () => void;
  hasPermission?: (permissionKey: string) => boolean;
  instanceId?: string;
  navItems?: NavItem[];
  rootHref?: string;
  /** Icon-only rail - labels and section headers collapse away. */
  collapsed?: boolean;
  /** "horizontal" renders the mobile strip: one sideways-scrolling row. */
  orientation?: "vertical" | "horizontal";
}

export function SidebarNav({
  onNavigate,
  hasPermission,
  instanceId = "default",
  navItems = NAV_ITEMS,
  rootHref = "/system/dashboard",
  collapsed = false,
  orientation = "vertical",
}: SidebarNavProps) {
  const pathname = usePathname();
  const horizontal = orientation === "horizontal";
  const items = hasPermission
    ? navItems.filter((item) => hasPermission(item.permission))
    : navItems;

  // In the strip the active item can sit off-screen, so pull it into view.
  const activeRef = React.useRef<HTMLAnchorElement>(null);
  React.useEffect(() => {
    if (!horizontal) return;
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [horizontal, pathname]);

  return (
    <nav
      className={cn(
        horizontal
          ? // `scrollbar-none` keeps the strip clean; it stays swipeable/trackpad-scrollable.
            "flex items-center gap-1 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "grid gap-1 px-2",
      )}
    >
      {items.map((item, index) => {
        const active =
          item.href === rootHref
            ? pathname === item.href
            : pathname.startsWith(item.href);
        const sectionChanged =
          item.section && item.section !== items[index - 1]?.section;
        return (
          <React.Fragment key={item.href}>
            {sectionChanged && !horizontal && !collapsed && (
              <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-white/40 uppercase">
                {item.section}
              </div>
            )}
            {/* Collapsed has no room for the header, so keep the grouping as a rule. */}
            {sectionChanged && !horizontal && collapsed && index > 0 && (
              <div className="mx-3 my-2 border-t border-white/10" />
            )}
            <Link
              ref={active ? activeRef : undefined}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                horizontal ? "shrink-0 gap-2 px-3" : "gap-3 px-3",
                collapsed && !horizontal && "justify-center px-0",
                active
                  ? "text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`active-nav-pill-${instanceId}`}
                  className={cn(
                    "absolute inset-0 rounded-lg bg-[var(--sidebar-active-bg)]",
                    !horizontal &&
                      "border-l-2 border-[var(--sidebar-active-border)]",
                    horizontal &&
                      "border-b-2 border-[var(--sidebar-active-border)]",
                  )}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <item.icon className="relative z-10 size-4 shrink-0" />
              {!(collapsed && !horizontal) && (
                <span className="relative z-10 whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
