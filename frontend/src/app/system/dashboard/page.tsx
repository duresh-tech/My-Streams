"use client";

import * as React from "react";
import {
  Activity,
  KeyRound,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type DashboardStats } from "@/lib/api";

const CARDS = [
  { key: "users", label: "System Users", icon: Users },
  { key: "activeUsers", label: "Active Users", icon: UserCheck },
  { key: "roles", label: "Roles", icon: ShieldCheck },
  { key: "permissions", label: "Permissions", icon: KeyRound },
  { key: "activeSessions", label: "Active Sessions", icon: Activity },
] as const;

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
        <Card className="border-destructive/50">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">
                {stats ? stats[key] : "–"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
