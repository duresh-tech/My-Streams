"use client";

import { BillingJobCard } from "@/components/billing-job-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSession } from "@/hooks/use-tenant-session";

/** The business's scheduled jobs. Today that is the billing job only. */
export default function TenantCronJobsPage() {
  const { hasPermission } = useTenantSession();

  if (!hasPermission("tenant-billing-settings:view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Cron Jobs</CardTitle>
          <CardDescription>You don&apos;t have permission to view scheduled jobs.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <BillingJobCard canUpdate={hasPermission("tenant-billing-settings:update")} />;
}
