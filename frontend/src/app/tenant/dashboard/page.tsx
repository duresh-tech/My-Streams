"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Building2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { fadeUp, staggerContainer, staggerItem } from "@/components/motion/variants";
import { tenantApi, type TenantDashboardStats } from "@/lib/tenant-api";

export default function TenantDashboardPage() {
  const [stats, setStats] = React.useState<TenantDashboardStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    tenantApi<TenantDashboardStats>("/tenant/dashboard")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your tenant account.
        </p>
      </div>

      {error && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border-destructive/50">
            <CardContent className="text-sm text-destructive">{error}</CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={staggerItem}>
          <StatCard
            label="My Businesses"
            value={stats ? stats.businesses : null}
            icon={Building2}
            tint="indigo"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
