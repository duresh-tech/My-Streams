"use client";

import * as React from "react";
import {
  Activity,
  Building2,
  Contact,
  KeyRound,
  Radio,
  Server,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ColumnChart, TrendChart } from "@/components/dashboard/charts";
import { BarList, KpiTile, PanelCard, RangeTabs } from "@/components/dashboard/widgets";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/billing";
import {
  DASHBOARD_RANGES,
  formatCount,
  toRows,
  type DashboardRange,
  type SystemOverview,
} from "@/lib/dashboard";

export default function DashboardPage() {
  const timezone = useAppTimezone();
  const [range, setRange] = React.useState<DashboardRange>("30d");
  const [data, setData] = React.useState<SystemOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [currency, setCurrency] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api<SystemOverview>(`/system/dashboard/overview?range=${range}`)
      .then((overview) => {
        if (cancelled) return;
        setData(overview);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load the dashboard"));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const loading = !data || data.range !== range;
  const period = DASHBOARD_RANGES.find((r) => r.value === range)?.description ?? "";
  const buckets = data?.buckets ?? [];
  // Billing is shown one currency at a time; defaults to the one with the most collected.
  const billing = data?.billing.find((b) => b.currency === currency) ?? data?.billing[0] ?? null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            The platform across every tenant, for the {period}
            {data && ` · updated ${formatDateTime(data.generatedAt, timezone)}`}.
          </p>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className={loading && data ? "grid gap-6 opacity-60 transition-opacity" : "grid gap-6 transition-opacity"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Businesses" value={data ? data.growth.businesses : null} icon={Building2} tint="indigo" />
          <StatCard label="Tenant users" value={data ? data.growth.tenantUsers : null} icon={Users} tint="violet" />
          <StatCard label="Customers" value={data ? data.growth.customers : null} icon={Contact} tint="sky" />
          <StatCard label="Streaming servers" value={data ? data.infrastructure.servers.total : null} icon={Server} tint="amber" />
          <StatCard label="Streams" value={data ? data.infrastructure.streams.total : null} icon={Radio} tint="emerald" />
          <StatCard
            label="Active sessions"
            value={data ? data.access.activeSessions + data.access.activeTenantSessions : null}
            icon={Activity}
            tint="indigo"
          />
        </div>

        {data && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title="Growth"
                description={`New sign-ups, ${period}`}
                legend={[
                  { label: "Customers", color: "var(--viz-1)" },
                  { label: "Tenant users", color: "var(--viz-2)" },
                  { label: "Businesses", color: "var(--viz-3)" },
                ]}
                table={{
                  columns: ["Period", "Customers", "Tenant users", "Businesses"],
                  rows: buckets.map((b, i) => [
                    b.label,
                    formatCount(data.growth.customersSeries[i]),
                    formatCount(data.growth.tenantUsersSeries[i]),
                    formatCount(data.growth.businessesSeries[i]),
                  ]),
                }}
              >
                <TrendChart
                  integer
                  data={toRows(buckets, {
                    customers: data.growth.customersSeries,
                    tenantUsers: data.growth.tenantUsersSeries,
                    businesses: data.growth.businessesSeries,
                  })}
                  series={[
                    { key: "customers", name: "Customers", color: "var(--viz-1)" },
                    { key: "tenantUsers", name: "Tenant users", color: "var(--viz-2)" },
                    { key: "businesses", name: "Businesses", color: "var(--viz-3)" },
                  ]}
                  format={formatCount}
                />
              </ChartCard>

              <PanelCard title="Largest businesses" description="By customers">
                <BarList
                  items={data.growth.topBusinesses.map((business) => ({
                    label: business.name,
                    value: business.customers,
                    hint: `${formatCount(business.streams)} streams`,
                  }))}
                  format={formatCount}
                  emptyText="No businesses yet."
                />
              </PanelCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <PanelCard title="Server connections" description={`${formatCount(data.infrastructure.servers.active)} of ${formatCount(data.infrastructure.servers.total)} servers active`}>
                <BarList
                  items={[
                    { label: "Connected", value: data.infrastructure.servers.connected, color: "var(--success)" },
                    { label: "Unreachable", value: data.infrastructure.servers.unreachable, color: "var(--warning)" },
                    { label: "Unauthorized", value: data.infrastructure.servers.unauthorized, color: "var(--destructive)" },
                    { label: "Not checked", value: data.infrastructure.servers.unknown, color: "var(--muted-foreground)" },
                  ]}
                  format={formatCount}
                  emptyText="No servers yet."
                />
              </PanelCard>

              <PanelCard title="Streams" description={`${formatCount(data.infrastructure.streams.total)} across all tenants`}>
                <BarList
                  items={[
                    { label: "Running", value: data.infrastructure.streams.enabled, color: "var(--success)" },
                    { label: "Switched off by billing", value: data.infrastructure.streams.billingOff, color: "var(--destructive)" },
                    {
                      label: "Switched off by a user",
                      value: Math.max(0, data.infrastructure.streams.disabled - data.infrastructure.streams.billingOff),
                      color: "var(--muted-foreground)",
                    },
                  ]}
                  format={formatCount}
                  emptyText="No streams yet."
                />
              </PanelCard>

              <PanelCard title="Servers needing attention" description="Active but not connecting">
                {data.infrastructure.attention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Every active server connected at its last check.</p>
                ) : (
                  <div className="grid gap-2">
                    {data.infrastructure.attention.map((server) => (
                      <div key={server.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{server.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{server.business}</div>
                        </div>
                        <Badge variant={server.connectionStatus === "UNAUTHORIZED" ? "destructive" : "warning"}>
                          {server.connectionStatus === "UNAUTHORIZED" ? "Unauthorized" : "Unreachable"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </PanelCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {billing ? (
                <ChartCard
                  className="lg:col-span-2"
                  title="Payments collected"
                  description={`${formatCount(billing.invoices)} invoices issued, ${period} · amounts in ${billing.currency}, never mixed with other currencies`}
                  action={
                    data.billing.length > 1 ? (
                      <Select value={billing.currency} onValueChange={setCurrency}>
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {data.billing.map((b) => (
                            <SelectItem key={b.currency} value={b.currency}>
                              {b.currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : undefined
                  }
                  table={{
                    columns: ["Period", "Invoices", "Collected"],
                    rows: buckets.map((b, i) => [
                      b.label,
                      formatCount(billing.invoicesSeries[i]),
                      formatMoney(billing.collectedSeries[i], billing.currency),
                    ]),
                  }}
                >
                  <ColumnChart
                    data={toRows(buckets, { collected: billing.collectedSeries })}
                    series={[{ key: "collected", name: "Collected", color: "var(--viz-1)" }]}
                    format={(value) => formatMoney(value, billing.currency)}
                  />
                </ChartCard>
              ) : (
                <PanelCard className="lg:col-span-2" title="Payments collected">
                  <p className="text-sm text-muted-foreground">No invoices or payments in the {period}.</p>
                </PanelCard>
              )}

              <div className="grid gap-4">
                <KpiTile
                  label={billing ? `Collected (${billing.currency})` : "Collected"}
                  value={billing ? formatMoney(billing.collected, billing.currency) : "—"}
                  hint={`Across all tenants, ${period}`}
                  icon={Activity}
                />
                <KpiTile
                  label={billing ? `Outstanding (${billing.currency})` : "Outstanding"}
                  value={billing ? formatMoney(billing.outstanding, billing.currency) : "—"}
                  hint="Unpaid balance on open invoices"
                  icon={KeyRound}
                  tone={billing && billing.outstanding > 0 ? "warning" : "default"}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title="Signed-in users"
                description={`Distinct users who started or renewed a session, ${period}`}
                legend={[
                  { label: "Tenant users", color: "var(--viz-1)" },
                  { label: "System users", color: "var(--viz-2)" },
                ]}
                table={{
                  columns: ["Period", "Tenant users", "System users"],
                  rows: buckets.map((b, i) => [
                    b.label,
                    formatCount(data.access.tenantUsersSeries[i]),
                    formatCount(data.access.systemUsersSeries[i]),
                  ]),
                }}
              >
                <TrendChart
                  integer
                  data={toRows(buckets, { tenant: data.access.tenantUsersSeries, system: data.access.systemUsersSeries })}
                  series={[
                    { key: "tenant", name: "Tenant users", color: "var(--viz-1)" },
                    { key: "system", name: "System users", color: "var(--viz-2)" },
                  ]}
                  format={formatCount}
                />
              </ChartCard>

              <PanelCard title="Access" description="System console accounts and live sessions">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "System users", value: data.access.users, icon: Users },
                    { label: "Active users", value: data.access.activeUsers, icon: UserCheck },
                    { label: "Roles", value: data.access.roles, icon: ShieldCheck },
                    { label: "Permissions", value: data.access.permissions, icon: KeyRound },
                    { label: "System sessions", value: data.access.activeSessions, icon: Activity },
                    { label: "Tenant sessions", value: data.access.activeTenantSessions, icon: Activity },
                    { label: "Customer sessions", value: data.access.activeCustomerSessions, icon: Contact },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-lg border p-2.5">
                      <item.icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">{item.label}</div>
                        <div className="text-lg font-semibold">{formatCount(item.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
