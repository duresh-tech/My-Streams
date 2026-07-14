"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  User,
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
import { NAV_ITEMS, SidebarNav } from "@/components/sidebar-nav";
import { NavBreadcrumb } from "@/components/nav-breadcrumb";
import { CommandPalette } from "@/components/command-palette";
import { PageTransition } from "@/components/motion/page-transition";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionProvider, useSession } from "@/hooks/use-session";
import { APP_NAME } from "@/lib/app-name";

function Brand() {
  return (
    <Link
      href="/system/dashboard"
      className="flex items-center gap-2 px-4 font-semibold"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="size-4" />
      </span>
      {APP_NAME}
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SessionProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[image:var(--gradient-sidebar)] shadow-[var(--shadow-sidebar)] md:flex">
          <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex-1 space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[image:var(--gradient-sidebar)] text-sidebar-foreground shadow-[var(--shadow-sidebar)] md:flex">
        <div className="flex h-14 items-center border-b border-white/10">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav hasPermission={hasPermission} instanceId="desktop" />
        </div>
        <div className="border-t border-white/10 p-4 text-xs text-white/50">
          Signed in as <span className="font-medium text-white/80">{user.username}</span>
          <br />
          Role: <span className="font-medium text-white/80">{user.roleKey}</span>
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
            <SheetContent
              side="left"
              className="w-72 border-white/10 bg-[image:var(--gradient-sidebar)] p-0 text-sidebar-foreground"
            >
              <SheetHeader className="h-14 justify-center border-b border-white/10">
                <SheetTitle asChild className="text-sidebar-foreground">
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <div className="py-2">
                <SidebarNav
                  onNavigate={() => setMobileOpen(false)}
                  hasPermission={hasPermission}
                  instanceId="mobile"
                />
              </div>
            </SheetContent>
          </Sheet>

          <NavBreadcrumb rootLabel="System Console" navItems={NAV_ITEMS} />

          <Button
            variant="outline"
            size="sm"
            className="hidden gap-2 text-muted-foreground sm:flex"
            onClick={() => setPaletteOpen(true)}
          >
            <Search className="size-4" />
            Search
            <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Search"
            onClick={() => setPaletteOpen(true)}
          >
            <Search className="size-4" />
          </Button>
          <CommandPalette
            navItems={NAV_ITEMS}
            hasPermission={hasPermission}
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="size-4" />
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
              <DropdownMenuItem disabled>
                <User className="size-4" /> {user.roleKey}
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
