"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Radio, ReceiptText, Server, UserCircle, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/app-name";
import { AppLogo } from "@/components/app-logo";
import { InstallPrompt } from "@/components/install-prompt";
import {
  customerApi,
  getCustomerAccessToken,
  setCustomerAccessToken,
  type CustomerProfile,
} from "@/lib/customer-api";

const NAV = [
  { href: "/customer/streams", label: "My Streams", icon: Radio },
  { href: "/customer/servers", label: "My Servers", icon: Server },
  { href: "/customer/billing", label: "My Bills", icon: ReceiptText },
  { href: "/customer/profile", label: "My Profile", icon: UserRound },
];

/**
 * Chrome for the customer portal: a slim top bar rather than the tenant
 * portal's sidebar, because a customer has only two destinations and is often
 * on a phone.
 */
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = React.useState<CustomerProfile | null>(null);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    // No token at all: go straight to login rather than firing a request that
    // is certain to 401.
    if (!getCustomerAccessToken()) {
      router.replace("/customer/login");
      return;
    }
    customerApi<CustomerProfile>("/customer/auth/me")
      .then(setProfile)
      .catch(() => {
        // customerApi already redirects on an unrecoverable 401.
      })
      .finally(() => setChecked(true));
  }, [router]);

  async function onLogout() {
    try {
      await customerApi("/customer/auth/logout", { method: "POST" });
    } catch {
      // Even if the call fails, the local token must go.
    }
    setCustomerAccessToken(null);
    toast.success("Signed out");
    router.replace("/customer/login");
  }

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      {/* Two rows on a phone - brand and account, then the nav - and one row
          from sm up. Wrapping all of it into a single flex row is what made
          the header three lines tall and squeezed the page below it. */}
      <header className="bg-card sticky top-0 z-10 border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/customer/streams"
              className="flex min-w-0 items-center gap-2 font-semibold"
            >
              <AppLogo size={32} className="shrink-0 rounded-lg" />
              <span className="truncate">{APP_NAME}</span>
            </Link>

            {/* On a phone the account controls sit on the brand row, where
                there is space, rather than below the nav. */}
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:hidden">
              <ThemeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>

          {/* Scrolls sideways rather than wrapping, so a third destination
              never pushes the labels onto two lines each. */}
          <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap sm:px-3",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}

            {/* The impersonation badge follows the nav on a phone: it must stay
                visible at every width, so it is never hidden, only moved. */}
            {profile?.impersonated && (
              <Badge variant="warning" className="ml-1 shrink-0 sm:hidden">
                Signed in as customer
              </Badge>
            )}
          </nav>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            {/* A support agent acting on the account should be obvious, not
                indistinguishable from the customer. */}
            {profile?.impersonated && (
              <Badge variant="warning">Signed in as this customer</Badge>
            )}
            {profile && (
              <span className="text-muted-foreground hidden items-center gap-1.5 text-sm lg:flex">
                <UserCircle className="size-4" />
                {profile.fName} · {profile.customerCode}
              </span>
            )}
            <ThemeToggle />
            <Button type="button" variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-4">
        {checked || profile ? children : null}
      </main>

      {/* Only once the customer is actually signed in - `profile` is the
          answer from /customer/auth/me, so an expired token never sees it. */}
      {profile && <InstallPrompt />}
    </div>
  );
}
