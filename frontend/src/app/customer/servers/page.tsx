"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Server, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceBillingBadges } from "@/components/service-billing-badges";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";
import { customerApi, CustomerApiError, type CustomerServer } from "@/lib/customer-api";

interface ConnectionCheck {
  serverId: string;
  name: string;
  connectionStatus: string;
  connectionCheckedAt: number | null;
}

const CONNECTION_BADGE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "outline" }> = {
  CONNECTED: { label: "Online", variant: "success" },
  UNAUTHORIZED: { label: "Unauthorized", variant: "destructive" },
  UNREACHABLE: { label: "Unreachable", variant: "warning" },
  UNKNOWN: { label: "Not checked", variant: "outline" },
};

const CHECK_MESSAGE: Record<string, { ok: boolean; text: string }> = {
  CONNECTED: { ok: true, text: "Server is online" },
  UNREACHABLE: { ok: false, text: "Server is not responding" },
  UNAUTHORIZED: { ok: false, text: "Server refused the connection" },
  UNKNOWN: { ok: false, text: "Connection could not be determined" },
};

export default function CustomerServersPage() {
  const timezone = useAppTimezone();
  const [servers, setServers] = React.useState<CustomerServer[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [checkingId, setCheckingId] = React.useState<string | null>(null);
  const [checkedAt, setCheckedAt] = React.useState<Record<string, number | null>>({});

  React.useEffect(() => {
    customerApi<CustomerServer[]>("/customer/servers")
      .then(setServers)
      .catch((err) =>
        setError(err instanceof CustomerApiError ? err.message : "Could not load your servers"),
      );
  }, []);

  /**
   * Connectivity only - the one diagnostic a customer can run themselves. The
   * card's badge is updated in place rather than reloading the list, so the
   * quota figures on screen do not flicker.
   */
  async function onCheckConnection(server: CustomerServer) {
    setCheckingId(server.serverId);
    try {
      const result = await customerApi<ConnectionCheck>(
        `/customer/servers/${server.serverId}/check-connection`,
        { method: "POST" },
      );
      setServers((current) =>
        (current ?? []).map((item) =>
          item.serverId === server.serverId
            ? { ...item, connectionStatus: result.connectionStatus }
            : item,
        ),
      );
      setCheckedAt((current) => ({ ...current, [server.serverId]: result.connectionCheckedAt }));
      const outcome = CHECK_MESSAGE[result.connectionStatus] ?? CHECK_MESSAGE.UNKNOWN;
      if (outcome.ok) toast.success(outcome.text);
      else toast.error(outcome.text);
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Could not check the connection");
    } finally {
      setCheckingId(null);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!servers) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading your servers...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">My Servers</h1>
        <p className="text-muted-foreground text-sm">
          The streaming servers available to you, and how many streams you may run on each.
        </p>
      </div>

      {servers.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            No servers are assigned to your account yet. Contact your provider to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => {
            const connection = CONNECTION_BADGE[server.connectionStatus] ?? CONNECTION_BADGE.UNKNOWN;
            return (
              <Card key={server.assignmentId}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 font-medium">
                      <Server className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate">{server.name}</span>
                    </div>
                    <Badge variant={connection.variant} className="shrink-0">
                      {connection.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {server.isDedicated && <Badge variant="info">Dedicated</Badge>}
                    {server.serverStatus !== "ACTIVE" && (
                      <Badge variant="outline">{server.serverStatus}</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ServiceBillingBadges
                      billing={server.billing}
                      timezone={timezone}
                      invoiceHref={(id) => `/customer/billing/${id}`}
                    />
                    {server.billing && (
                      <span className="text-muted-foreground text-xs">{server.billing.planName}</span>
                    )}
                  </div>

                  <div>
                    <div className="text-2xl font-semibold">
                      {server.streamsUsed}
                      <span className="text-muted-foreground text-base font-normal">
                        {" / "}
                        {server.streamLimit === null ? "unlimited" : server.streamLimit}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {server.streamLimit === null
                        ? "streams — no limit on this server"
                        : server.streamsRemaining === 0
                          ? "streams — limit reached"
                          : `streams — ${server.streamsRemaining} remaining`}
                    </div>
                  </div>

                  {checkedAt[server.serverId] !== undefined && (
                    <div className="text-muted-foreground text-xs">
                      Checked{" "}
                      {checkedAt[server.serverId]
                        ? formatDateTime(checkedAt[server.serverId], timezone)
                        : "just now"}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onCheckConnection(server)}
                    disabled={checkingId === server.serverId || !server.canCheckConnection}
                    title={
                      server.canCheckConnection
                        ? "Test whether this server is reachable"
                        : "Only an active server can be checked"
                    }
                  >
                    {checkingId === server.serverId ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Wifi className="size-4" />
                    )}
                    Check connection
                  </Button>

                  {server.serverStatus !== "ACTIVE" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      This server is {server.serverStatus.toLowerCase()}, so it cannot be used
                      right now. Contact your provider.
                    </p>
                  )}

                  {/* Disabled rather than hidden when the quota is full or the
                      server is not active, so it is clear the action exists but
                      something is in the way. */}
                  <Button asChild={server.canCreateStream} variant="outline" size="sm" disabled={!server.canCreateStream}>
                    {server.canCreateStream ? (
                      <Link href={`/customer/streams?create=${server.serverId}`}>
                        <Plus className="size-4" /> Add stream
                      </Link>
                    ) : (
                      <span>
                        <Plus className="size-4" />
                        {server.serverStatus === "ACTIVE" ? "Limit reached" : "Server unavailable"}
                      </span>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
