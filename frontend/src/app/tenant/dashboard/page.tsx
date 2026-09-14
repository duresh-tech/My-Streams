"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CircleDollarSign, Clock, Radio, Users, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ColumnChart, TrendChart } from "@/components/dashboard/charts";
import { BarList, KpiTile, PanelCard, RangeTabs } from "@/components/dashboard/widgets";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";
import { INVOICE_STATUS_BADGE, formatMoney } from "@/lib/billing";
import {
  DASHBOARD_RANGES,
  formatCount,
  toRows,
  type DashboardRange,
  type TenantOverview,
} from "@/lib/dashboard";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

const CONNECTION_LABEL: Record<string, string> = {
  CONNECTED: "Connected",
  UNREACHABLE: "Unreachable",
  UNAUTHORIZED: "Unauthorized",
  UNKNOWN: "Not checked",
};

export default function TenantDashboardPage() {
  const timezone = useAppTimezone();
  const [range, setRange] = React.useState<DashboardRange>("30d");
  const [data, setData] = React.useState<TenantOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    tenantApi<TenantOverview>(`/tenant/dashboard/overview?range=${range}`)
      .then((overview) => {
        if (cancelled) return;
        setData(overview);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof TenantApiError ? err.message : "Failed to load the dashboard"));
    return () => {
      cancelled = true;
    };
  }, [range]);

  // The previous range stays on screen, dimmed, until the new one arrives.
  const loading = !data || data.range !== range;
  const period = DASHBOARD_RANGES.find((r) => r.value === range)?.description ?? "";
  const buckets = data?.buckets ?? [];
  const { billing, streams, customers, events, incomeExpense } = data ?? {
    billing: null,
    streams: null,
    customers: null,
    events: null,
    incomeExpense: null,
  };
  const nothingPermitted = !!data && !billing && !streams && !customers && !events && !incomeExpense;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your business at a glance, for the {period}
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

      {nothingPermitted && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Your role has no dashboard sections. Ask an administrator for access to billing, streams or customers.
          </CardContent>
        </Card>
      )}

      <div className={loading && data ? "grid gap-6 opacity-60 transition-opacity" : "grid gap-6 transition-opacity"}>
        {/* KPI row: only the figures this user may see. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {(!data || billing) && (
            <KpiTile
              label="Collected"
              value={billing ? formatMoney(billing.collected, billing.currency) : null}
              hint={`Payments, ${period}`}
              icon={CircleDollarSign}
            />
          )}
          {(!data || billing) && (
            <KpiTile
              label="Outstanding"
              value={billing ? formatMoney(billing.outstanding, billing.currency) : null}
              hint={billing ? `${billing.openCount} open invoice${billing.openCount === 1 ? "" : "s"}` : undefined}
              icon={Wallet}
            />
          )}
          {(!data || billing) && (
            <KpiTile
              label="Overdue"
              value={billing ? formatMoney(billing.overdueAmount, billing.currency) : null}
              hint={billing ? `${billing.overdueCount} invoice${billing.overdueCount === 1 ? "" : "s"} past due` : undefined}
              icon={AlertTriangle}
              tone={billing && billing.overdueCount > 0 ? "danger" : "default"}
            />
          )}
          {(!data || customers) && (
            <StatCard label="Active customers" value={customers ? customers.active : null} icon={Users} tint="sky" />
          )}
          {(!data || streams) && (
            <StatCard label="Streams running" value={streams ? streams.enabled : null} icon={Radio} tint="emerald" />
          )}
          {(!data || events) && (
            <StatCard label="Alert emails sent" value={events ? events.alerts.sent : null} icon={BellRing} tint="violet" />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {billing && (
            <ChartCard
              title="Payments collected"
              description={`${billing.currency}, ${period}`}
              table={{
                columns: ["Period", "Collected"],
                rows: buckets.map((b, i) => [b.label, formatMoney(billing.collectedSeries[i], billing.currency)]),
              }}
            >
              <ColumnChart
                data={toRows(buckets, { collected: billing.collectedSeries })}
                series={[{ key: "collected", name: "Collected", color: "var(--viz-1)" }]}
                format={(value) => formatMoney(value, billing.currency)}
              />
            </ChartCard>
          )}

          {incomeExpense && (
            <ChartCard
              title="Income vs expense"
              description={`Net ${formatMoney(incomeExpense.net, incomeExpense.currency)}, ${period}`}
              legend={[
                { label: "Income", color: "var(--viz-1)" },
                { label: "Expense", color: "var(--viz-2)" },
              ]}
              table={{
                columns: ["Period", "Income", "Expense", "Net"],
                rows: buckets.map((b, i) => [
                  b.label,
                  formatMoney(incomeExpense.incomeSeries[i], incomeExpense.currency),
                  formatMoney(incomeExpense.expenseSeries[i], incomeExpense.currency),
                  formatMoney(incomeExpense.incomeSeries[i] - incomeExpense.expenseSeries[i], incomeExpense.currency),
                ]),
              }}
            >
              <TrendChart
                data={toRows(buckets, { income: incomeExpense.incomeSeries, expense: incomeExpense.expenseSeries })}
                series={[
                  { key: "income", name: "Income", color: "var(--viz-1)" },
                  { key: "expense", name: "Expense", color: "var(--viz-2)" },
                ]}
                format={(value) => formatMoney(value, incomeExpense.currency)}
              />
            </ChartCard>
          )}

          {events && (
            <ChartCard
              title="Stream events"
              description={`${formatCount(events.total)} events, ${period}`}
              legend={[
                { label: "Source", color: "var(--viz-1)" },
                { label: "Stream", color: "var(--viz-2)" },
                { label: "Viewer", color: "var(--viz-3)" },
              ]}
              action={
                <Link href="/tenant/stream-events" className="px-2 text-xs text-muted-foreground hover:text-foreground">
                  Log
                </Link>
              }
              table={{
                columns: ["Period", "Source", "Stream", "Viewer"],
                rows: buckets.map((b, i) => [
                  b.label,
                  formatCount(events.series.SOURCE[i]),
                  formatCount(events.series.STREAM[i]),
                  formatCount(events.series.VIEWER[i]),
                ]),
              }}
            >
              <ColumnChart
                stacked
                integer
                data={toRows(buckets, { source: events.series.SOURCE, stream: events.series.STREAM, viewer: events.series.VIEWER })}
                series={[
                  { key: "source", name: "Source", color: "var(--viz-1)" },
                  { key: "stream", name: "Stream", color: "var(--viz-2)" },
                  { key: "viewer", name: "Viewer", color: "var(--viz-3)" },
                ]}
                format={formatCount}
              />
              <p className="text-xs text-muted-foreground">
                Alerts: {formatCount(events.alerts.sent)} sent · {formatCount(events.alerts.failed)} failed ·{" "}
                {formatCount(events.alerts.cooldown)} held by cooldown
                {events.alerts.noMailConfig > 0 && ` · ${formatCount(events.alerts.noMailConfig)} without mail config`}
              </p>
            </ChartCard>
          )}

          {customers && (
            <ChartCard
              title="New customers"
              description={`${formatCount(customers.newInRange)} added, ${period} · ${formatCount(customers.total)} in total`}
              table={{
                columns: ["Period", "New customers"],
                rows: buckets.map((b, i) => [b.label, formatCount(customers.newSeries[i])]),
              }}
            >
              <ColumnChart
                integer
                data={toRows(buckets, { added: customers.newSeries })}
                series={[{ key: "added", name: "New customers", color: "var(--viz-1)" }]}
                format={formatCount}
              />
              <BarList
                items={[
                  { label: "With an active bill", value: customers.withActiveBill, color: "var(--success)" },
                  { label: "Without an active bill", value: customers.withoutActiveBill, color: "var(--muted-foreground)" },
                ]}
                format={formatCount}
              />
            </ChartCard>
          )}
        </div>

        {streams && (
          <div className="grid gap-4 lg:grid-cols-3">
            <PanelCard title="Streams" description={`${formatCount(streams.total)} streams`}>
              <BarList
                items={[
                  { label: "Running", value: streams.enabled, color: "var(--success)", hint: streams.exempt ? `${streams.exempt} enabled by override` : undefined },
                  { label: "Switched off by billing", value: streams.billingOff, color: "var(--destructive)" },
                  { label: "Switched off by a user", value: streams.disabledByUser, color: "var(--muted-foreground)" },
                ]}
                format={formatCount}
                emptyText="No streams yet."
              />
            </PanelCard>

            <PanelCard title="Streams per server" description="Top servers by stream count">
              <BarList
                items={streams.perServer.map((row) => ({
                  label: row.name,
                  value: row.enabled + row.disabled,
                  hint: row.disabled ? `${row.disabled} off` : undefined,
                }))}
                format={formatCount}
                emptyText="No streams on any server yet."
              />
            </PanelCard>

            {streams.servers && (
              <PanelCard title="Server connections" description={`${formatCount(streams.servers.total)} servers`}>
                <div className="grid gap-4">
                  <BarList
                    items={[
                      { label: "Connected", value: streams.servers.connected, color: "var(--success)" },
                      { label: "Unreachable", value: streams.servers.unreachable, color: "var(--warning)" },
                      { label: "Unauthorized", value: streams.servers.unauthorized, color: "var(--destructive)" },
                      { label: "Not checked", value: streams.servers.unknown, color: "var(--muted-foreground)" },
                    ]}
                    format={formatCount}
                    emptyText="No servers yet."
                  />
                  {streams.servers.attention.length > 0 && (
                    <div className="grid gap-1.5 border-t pt-3">
                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Needs attention</div>
                      {streams.servers.attention.map((server) => (
                        <div key={server.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{server.name}</span>
                          <Badge variant={server.connectionStatus === "UNAUTHORIZED" ? "destructive" : "warning"}>
                            {server.status !== "ACTIVE" ? server.status.toLowerCase() : CONNECTION_LABEL[server.connectionStatus]}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PanelCard>
            )}
          </div>
        )}

        {billing && (
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard title="Invoices by status" description={`Issued in the ${period}`}>
              <BarList
                items={billing.invoiceStatus
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((row) => ({ label: INVOICE_STATUS_BADGE[row.status]?.label ?? row.status, value: row.count }))}
                format={formatCount}
                emptyText={`No invoices issued in the ${period}.`}
              />
            </PanelCard>

            <PanelCard title="Expiring in the next 7 days" description="Active plans that end soon">
              {billing.expiringSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing expires in the next 7 days.</p>
              ) : (
                <div className="grid gap-2">
                  {billing.expiringSoon.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.customer}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.planName} · {item.target}
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {formatDateTime(item.currentPeriodEnd, timezone)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          </div>
        )}
      </div>
    </div>
  );
}
