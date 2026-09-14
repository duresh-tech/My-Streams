/** Stream event names and labels, mirroring backend stream-events.logic.ts. */

export interface StreamEventGroup {
  group: "SOURCE" | "STREAM" | "VIEWER";
  label: string;
  events: string[];
}

export const STREAM_EVENT_GROUPS: StreamEventGroup[] = [
  {
    group: "SOURCE",
    label: "Source",
    events: ["source_opened", "source_connected", "source_started", "source_updated", "source_closed"],
  },
  { group: "STREAM", label: "Stream", events: ["stream_opened", "stream_updated", "stream_closed"] },
  { group: "VIEWER", label: "Viewer", events: ["play_opened", "play_started", "play_updated", "play_closed"] },
];

/** Source and stream events; viewer events are opt-in because they are chatty. */
export const DEFAULT_EVENT_TYPES = STREAM_EVENT_GROUPS.filter((g) => g.group !== "VIEWER").flatMap((g) => g.events);

export type EmailStatus = "NOT_MATCHED" | "SENT" | "COOLDOWN" | "FAILED" | "NO_MAIL_CONFIG";

export const EMAIL_STATUS_BADGE: Record<
  EmailStatus,
  { label: string; variant: "outline" | "success" | "secondary" | "destructive" | "warning" }
> = {
  NOT_MATCHED: { label: "No alert", variant: "outline" },
  SENT: { label: "Email sent", variant: "success" },
  COOLDOWN: { label: "Cooling down", variant: "secondary" },
  FAILED: { label: "Email failed", variant: "destructive" },
  NO_MAIL_CONFIG: { label: "No mail config", variant: "warning" },
};
