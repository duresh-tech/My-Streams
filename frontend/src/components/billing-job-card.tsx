"use client";

import * as React from "react";
import { LoaderCircle, Play, Save, Timer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

interface JobResult {
  trigger: "SCHEDULE" | "MANUAL";
  startedAt: number;
  finishedAt: number;
  pastDue: number;
  suspended: number;
  streamsDisabled: number;
  streamsEnabled: number;
  /** Absent on runs recorded before these counts existed. */
  streamsBlocked?: number;
  streamsReDisabled?: number;
  streamsReEnabled?: number;
  activated?: number;
  failed: number;
  error: string | null;
}

interface JobStatus {
  intervalMinutes: number;
  paused: boolean;
  running: boolean;
  lastRunAt: number | null;
  lastResult: JobResult | null;
  nextRunAt: number | null;
  intervalPresets: number[];
}

/** Keeps last/next run current while the page stays open. */
const REFRESH_MS = 30000;

function intervalLabel(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Every hour" : `Every ${hours} hours`;
  }
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

function resultSummary(result: JobResult): string {
  return [
    ...(result.streamsBlocked !== undefined
      ? [`${result.streamsBlocked} stream${result.streamsBlocked === 1 ? "" : "s"} blocked`]
      : []),
    `${result.streamsDisabled} disabled`,
    ...(result.streamsReDisabled ? [`${result.streamsReDisabled} re-disabled on server`] : []),
    ...(result.streamsReEnabled ? [`${result.streamsReEnabled} re-enabled on server`] : []),
    ...(result.activated ? [`${result.activated} subscription${result.activated === 1 ? "" : "s"} activated`] : []),
    `${result.streamsEnabled} enabled`,
    `${result.pastDue} past due`,
    `${result.suspended} suspended`,
    ...(result.failed ? [`${result.failed} failed`] : []),
  ].join(" · ");
}

/**
 * The business's billing job: how often it runs, pause, run now, and what the
 * last run did. Interval and pause are saved through the billing settings.
 */
export function BillingJobCard({ canUpdate }: { canUpdate: boolean }) {
  const timezone = useAppTimezone();
  const [status, setStatus] = React.useState<JobStatus | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [intervalMinutes, setIntervalMinutes] = React.useState("");
  const [paused, setPaused] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [runningNow, setRunningNow] = React.useState(false);

  const load = React.useCallback(async (resetForm: boolean) => {
    try {
      const data = await tenantApi<JobStatus>("/tenant/billing-settings/job");
      setStatus(data);
      setLoadError(null);
      if (resetForm) {
        setIntervalMinutes(String(data.intervalMinutes));
        setPaused(data.paused);
      }
    } catch (error) {
      setLoadError(error instanceof TenantApiError ? error.message : "Failed to load the billing job");
    }
  }, []);

  React.useEffect(() => {
    void load(true);
    // Refreshes only the status, so unsaved changes to the form are kept.
    const timer = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function onSave() {
    setSaving(true);
    try {
      await tenantApi("/tenant/billing-settings", {
        method: "PATCH",
        body: { lifecycleIntervalMinutes: Number(intervalMinutes), lifecyclePaused: paused },
      });
      toast.success(paused ? "Billing job paused" : `Billing job runs ${intervalLabel(Number(intervalMinutes)).toLowerCase()}`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRunNow() {
    setRunningNow(true);
    try {
      const data = await tenantApi<JobStatus>("/tenant/billing-settings/job/run", { method: "POST" });
      setStatus(data);
      const result = data.lastResult;
      if (result?.error) toast.error(`Billing job failed: ${result.error}`);
      else if (result) toast.success(`Billing job finished: ${resultSummary(result)}`);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not run the billing job");
    } finally {
      setRunningNow(false);
    }
  }

  const dirty =
    !!status && (Number(intervalMinutes) !== status.intervalMinutes || paused !== status.paused);
  const result = status?.lastResult ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <Timer className="size-5 text-muted-foreground" />
          Billing job
          {status &&
            (status.running || runningNow ? (
              <Badge variant="info">Running</Badge>
            ) : status.paused ? (
              <Badge variant="warning">Paused</Badge>
            ) : (
              <Badge variant="success">Scheduled</Badge>
            ))}
        </CardTitle>
        <CardDescription>
          Checks your subscriptions and customer streams: marks lapsed plans past due, suspends them after the grace
          period, switches blocked streams off on the server and switches them back on once paid. Payments and
          cancellations apply straight away, whatever this schedule is.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {loadError && !status ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !status ? (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Run</Label>
                <Select value={intervalMinutes} onValueChange={setIntervalMinutes} disabled={!canUpdate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {status.intervalPresets.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {intervalLabel(minutes)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Shorter intervals switch expired streams off sooner, at the cost of more checks.
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label>Schedule</Label>
                <label className="flex w-fit items-center gap-2 text-sm">
                  <Checkbox
                    checked={paused}
                    onCheckedChange={(value) => setPaused(value === true)}
                    disabled={!canUpdate}
                  />
                  Pause scheduled runs
                </label>
                {paused && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    While paused, streams whose bill has lapsed keep running on the server. Customers still cannot edit,
                    enable, reload or delete them.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <div className="grid gap-1">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Last run</div>
                {status.lastRunAt === null || !result ? (
                  <div className="text-muted-foreground">Not run yet</div>
                ) : (
                  <>
                    <div className="font-medium">
                      {formatDateTime(status.lastRunAt, timezone)}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {result.trigger === "MANUAL" ? "run by hand" : "scheduled"} ·{" "}
                        {Math.max(0, result.finishedAt - result.startedAt)}s
                      </span>
                    </div>
                    {result.error ? (
                      <div className="text-destructive">{result.error}</div>
                    ) : (
                      <div className={result.failed ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                        {resultSummary(result)}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="grid gap-1">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next run</div>
                {status.nextRunAt === null ? (
                  <div className="text-muted-foreground">Paused</div>
                ) : (
                  <>
                    <div className="font-medium">{formatDateTime(status.nextRunAt, timezone)}</div>
                    <div className="text-muted-foreground">{intervalLabel(status.intervalMinutes)}, within a minute of this time</div>
                  </>
                )}
              </div>
            </div>

            {canUpdate && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onSave} disabled={saving || !dirty}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save schedule
                </Button>
                <Button type="button" variant="outline" onClick={onRunNow} disabled={runningNow || status.running}>
                  {runningNow ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Run now
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
