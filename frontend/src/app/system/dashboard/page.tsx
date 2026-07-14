"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  Activity,
  KeyRound,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { StatCard, type StatCardTint } from "@/components/stat-card";
import { fadeUp, staggerContainer, staggerItem } from "@/components/motion/variants";
import { api, type DashboardStats } from "@/lib/api";

const CARDS: { key: keyof DashboardStats; label: string; icon: typeof Users; tint: StatCardTint }[] = [
  { key: "users", label: "System Users", icon: Users, tint: "indigo" },
  { key: "activeUsers", label: "Active Users", icon: UserCheck, tint: "sky" },
  { key: "roles", label: "Roles", icon: ShieldCheck, tint: "violet" },
  { key: "permissions", label: "Permissions", icon: KeyRound, tint: "amber" },
  { key: "activeSessions", label: "Active Sessions", icon: Activity, tint: "emerald" },
];

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<DashboardStats>("/system/dashboard")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your system console.
        </p>
      </div>

      {error && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
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
        {CARDS.map(({ key, label, icon, tint }) => (
          <motion.div key={key} variants={staggerItem}>
            <StatCard
              label={label}
              value={stats ? stats[key] : null}
              icon={icon}
              tint={tint}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
