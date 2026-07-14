"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import type { NavItem } from "@/components/sidebar-nav";

interface NavBreadcrumbProps {
  rootLabel: string;
  navItems: NavItem[];
}

export function NavBreadcrumb({ rootLabel, navItems }: NavBreadcrumbProps) {
  const pathname = usePathname();
  const current = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="min-w-0 flex-1 truncate text-sm">
      <span className="font-medium text-muted-foreground">{rootLabel}</span>
      {current && (
        <>
          <ChevronRight className="mx-1 inline size-3.5 text-muted-foreground/60" />
          <span className="font-semibold text-foreground">{current.label}</span>
        </>
      )}
    </div>
  );
}
