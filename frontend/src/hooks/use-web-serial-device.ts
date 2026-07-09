"use client";

import * as React from "react";
import { DQ12_SERIAL_OPTIONS, DQ12_USB_FILTER } from "@/lib/bonrix-dq12-commands";

const RESPONSE_TIMEOUT_MS = 3000;
// Fire-and-forget commands (display/audio) still get a brief listen window so
// anything the device sends unsolicited ends up in the debug log, but absence
// of a reply is expected for these and must not count as a failure.
const IDLE_LISTEN_MS = 300;
const LIVENESS_CHECK_MS = 2000;

export interface SerialExchangeResult {
  atCommand: string;
  atResponse: string;
  success: boolean;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/**
 * Thin wrapper around the browser's Web Serial API (Chrome/Edge only) for
 * talking to a USB-attached device like the DQ12. The backend has no network
 * path to a merchant's counter PC, so the connect/write/read all happens here
 * in the tenant's own browser tab - the backend only ever receives the
 * generated QR payload beforehand and an audit log of the exchange after.
 */
export function useWebSerialDevice() {
  const [port, setPort] = React.useState<SerialPort | null>(null);
  const [connecting, setConnecting] = React.useState(false);

  const openPort = React.useCallback(async (candidate: SerialPort): Promise<SerialPort> => {
    await candidate.open(DQ12_SERIAL_OPTIONS);
    setPort(candidate);
    return candidate;
  }, []);

  const connect = React.useCallback(async (): Promise<SerialPort> => {
    if (!isWebSerialSupported()) {
      throw new Error("Web Serial is not supported in this browser - use Chrome or Edge");
    }
    setConnecting(true);
    try {
      const selected = await navigator.serial.requestPort();
      return await openPort(selected);
    } finally {
      setConnecting(false);
    }
  }, [openPort]);

  /** Re-opens a port this origin was already granted access to in an earlier
   * session - no picker/user-gesture required, so it's safe to call on mount
   * or after navigating between pages. Resolves to null if nothing to reconnect to.
   * Prefers a port matching DQ12_USB_FILTER, but falls back to the first
   * granted port if none match (that filter is a best guess, not confirmed). */
  const autoConnect = React.useCallback(async (): Promise<SerialPort | null> => {
    if (!isWebSerialSupported()) return null;
    const granted = await navigator.serial.getPorts();
    if (granted.length === 0) return null;
    const matching = granted.find((candidate) => {
      const info = candidate.getInfo();
      return info.usbVendorId === DQ12_USB_FILTER.usbVendorId && info.usbProductId === DQ12_USB_FILTER.usbProductId;
    });
    try {
      return await openPort(matching ?? granted[0]);
    } catch {
      return null;
    }
  }, [openPort]);

  const disconnect = React.useCallback(async () => {
    if (!port) return;
    try {
      await port.close();
    } finally {
      setPort(null);
    }
  }, [port]);

  // The OS/browser fires this when the physical device is unplugged - drop our
  // reference so the UI doesn't keep claiming a dead port is still connected.
  React.useEffect(() => {
    if (!isWebSerialSupported()) return;
    function onDisconnect() {
      setPort((current) => (current && (!current.readable || !current.writable) ? null : current));
    }
    navigator.serial.addEventListener("disconnect", onDisconnect);
    return () => navigator.serial.removeEventListener("disconnect", onDisconnect);
  }, []);

  // Periodic liveness check: a passive read of port.writable/readable, not an
  // attempt to lock a writer. A ~300KB RGB565 image push can legitimately hold
  // the writer locked for 20-30s at 115200 baud - grabbing a second writer
  // here (as Bonrix's own reference page does) throws "already locked" while
  // that's in flight, which was being misread as a real disconnect and killing
  // the transfer mid-way. Chrome nulls out writable/readable when the port
  // actually goes away, so checking those is enough without contending for the lock.
  React.useEffect(() => {
    if (!port) return;
    const interval = setInterval(() => {
      if (!port.writable || !port.readable) {
        setPort(null);
      }
    }, LIVENESS_CHECK_MS);
    return () => clearInterval(interval);
  }, [port]);

  /**
   * Writes a command string, then listens for whatever the device sends back.
   * Bonrix's own reference pages never gate success on a reply for display/audio
   * commands - those appear to be fire-and-forget on this device, only query-style
   * commands like AT+VER produce output. Pass expectResponse: true only for
   * genuine query commands; otherwise a successful write is treated as success
   * even if the device stays silent.
   */
  const sendCommand = React.useCallback(
    async (command: string, options: { expectResponse?: boolean } = {}): Promise<SerialExchangeResult> => {
      const { expectResponse = false } = options;
      if (!port || !port.writable) {
        throw new Error("Device not connected");
      }

      const writer = port.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(command));
      } finally {
        writer.releaseLock();
      }

      let response = "";
      if (port.readable) {
        const reader = port.readable.getReader();
        const decoder = new TextDecoder();
        const deadline = Date.now() + (expectResponse ? RESPONSE_TIMEOUT_MS : IDLE_LISTEN_MS);
        try {
          // Loop rather than a single read(): a reply can arrive in more than one
          // chunk, or slightly after the first read() call resolves with nothing yet.
          while (Date.now() < deadline) {
            const remaining = deadline - Date.now();
            const timedOut = Symbol("timeout");
            const timeout = new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), remaining));
            const outcome = await Promise.race([reader.read(), timeout]);
            if (outcome === timedOut) break;
            const { value, done } = outcome;
            if (done) break;
            if (value) response += decoder.decode(value, { stream: true });
            // Stop as soon as a line terminator shows up rather than waiting out the full window.
            if (/[\r\n]/.test(response)) break;
          }
        } catch {
          // Read error - report whatever was captured (possibly empty).
        } finally {
          // Cancel before releasing: releasing the lock while a read() is still
          // outstanding throws inside that pending promise (unhandled rejection).
          try {
            await reader.cancel();
          } catch {
            // Port may already be closing - safe to ignore.
          }
          reader.releaseLock();
        }
      }

      const trimmed = response.trim();
      const success = expectResponse ? trimmed.length > 0 : true;
      return { atCommand: command, atResponse: trimmed, success };
    },
    [port],
  );

  /** Writes a raw byte stream (the RGB565 framebuffer for a full-screen image)
   * with no read-back at all - matches Bonrix's own reference sendImage(),
   * which never waits for a reply after pushing a bitmap. */
  const sendRawBytes = React.useCallback(
    async (bytes: Uint8Array): Promise<void> => {
      if (!port || !port.writable) {
        throw new Error("Device not connected");
      }
      const writer = port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    },
    [port],
  );

  return { port, connected: !!port, connecting, connect, autoConnect, disconnect, sendCommand, sendRawBytes };
}
