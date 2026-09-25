"use client";

import * as React from "react";
import { Copy, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { isShareable, type Protocols } from "@/lib/stream-types";
import { shareUrl } from "@/lib/share-api";

interface StreamShareActionsProps {
  shareCode: string | null;
  protocols: Protocols | undefined;
  /** Issues a new code; the caller reloads the stream afterwards. */
  onRotate: () => Promise<void>;
  /** False hides the rotate action, e.g. without the update permission. */
  canRotate?: boolean;
}

/**
 * Open / copy / rotate for a stream's public share link.
 *
 * The whole block is hidden unless the stream serves a protocol a browser can
 * actually play - a share link for an RTMP-only stream would open a page that
 * can never start.
 */
export function StreamShareActions({
  shareCode,
  protocols,
  onRotate,
  canRotate = true,
}: StreamShareActionsProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);

  if (!isShareable(protocols)) return null;

  // Rows created before the share-code backfill have no code yet.
  if (!shareCode) {
    return (
      <p className="text-muted-foreground text-xs">
        No share link yet. Rotate once to create one.
        {canRotate && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-1.5 py-0 text-xs"
            onClick={() => setConfirmOpen(true)}
          >
            Create link
          </Button>
        )}
      </p>
    );
  }

  const url = shareUrl(shareCode);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      // Clipboard access is refused outside a secure context, and on http://
      // this is the common case rather than an edge one.
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  async function rotate() {
    setRotating(true);
    try {
      await onRotate();
      toast.success("New share link issued. The old one no longer works.");
      setConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate the share link");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code className="bg-muted text-muted-foreground truncate rounded px-2 py-1 font-mono text-xs">
        {url}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" /> Open
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy className="size-3.5" /> Copy
        </Button>
        {canRotate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={rotating}
          >
            {rotating ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Rotate
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Issue a new share link?"
        description={
          shareCode
            ? "The current link stops working immediately and anyone watching through it will be cut off. Anyone who still needs access will have to be sent the new link."
            : "This creates a public link that plays this stream. Anyone holding the link can watch, without signing in."
        }
        confirmLabel={shareCode ? "Rotate link" : "Create link"}
        loading={rotating}
        onConfirm={rotate}
      />
    </div>
  );
}
