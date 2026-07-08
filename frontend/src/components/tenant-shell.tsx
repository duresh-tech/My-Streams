"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { PageTransition } from "@/components/motion/page-transition";
import { ThemeToggle } from "@/components/theme-toggle";
import { TenantSessionProvider, useTenantSession } from "@/hooks/use-tenant-session";

const TENANT_NAV_ITEMS: NavItem[] = [
  { href: "/tenant/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "tenant-dashboard:view" },
  { href: "/tenant/users", label: "Users", icon: Users, permission: "tenant-users:read" },
  { href: "/tenant/settings/user-account", label: "Settings", icon: Settings, permission: "tenant-account:view" },
];

function Brand() {
  return (
    <Link
      href="/tenant/dashboard"
      className="flex items-center gap-2 px-4 font-semibold"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </span>
      Tenant Portal
    </Link>
  );
}

export function TenantShell({ children }: { children: React.ReactNode }) {
  return (
    <TenantSessionProvider>
      <TenantShellInner>{children}</TenantShellInner>
    </TenantSessionProvider>
  );
}

function TenantShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useTenantSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex-1 space-y-2 p-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 flex h-14 items-center gap-2 border-b px-4">
            <Skeleton className="size-9 rounded-md md:hidden" />
            <Skeleton className="h-4 w-40 flex-1" />
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </header>
          <main className="flex-1 space-y-4 p-4 md:p-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  const initials = (user.fName ?? user.username)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center border-b">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav
            hasPermission={hasPermission}
            instanceId="tenant-desktop"
            navItems={TENANT_NAV_ITEMS}
            rootHref="/tenant/dashboard"
          />
        </div>
        <div className="border-t p-4 text-xs text-muted-foreground">
          Signed in as <span className="font-medium">{user.username}</span>
          <br />
          Role: <span className="font-medium">{user.roleKey}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top navbar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="h-14 justify-center border-b">
                <SheetTitle asChild>
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <div className="py-2">
                <SidebarNav
                  onNavigate={() => setMobileOpen(false)}
                  hasPermission={hasPermission}
                  instanceId="tenant-mobile"
                  navItems={TENANT_NAV_ITEMS}
                  rootHref="/tenant/dashboard"
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1 truncate text-sm font-medium md:text-base">
            Welcome, {user.fName ?? user.username}
          </div>

          <ThemeToggle />
          <Separator orientation="vertical" className="mx-1 h-6" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <ChevronDown className="size-4 text-muted-foreground max-sm:hidden" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="grid">
                  <span>{user.fName ?? user.username}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/tenant/settings/user-account">
                  <User className="size-4" /> Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => logout()}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
