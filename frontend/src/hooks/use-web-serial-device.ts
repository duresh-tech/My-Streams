"use client";

import * as React from "react";
import { DQ12_SERIAL_OPTIONS } from "@/lib/bonrix-dq12-commands";

const RESPONSE_TIMEOUT_MS = 3000;

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
   * or after navigating between pages. Resolves to null if nothing to reconnect to. */
  const autoConnect = React.useCallback(async (): Promise<SerialPort | null> => {
    if (!isWebSerialSupported()) return null;
    const granted = await navigator.serial.getPorts();
    if (granted.length === 0) return null;
    try {
      return await openPort(granted[0]);
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

  /** Writes a command string, then reads back whatever the device sends within
   * the timeout window. A DQ12 command exchange is presumed request/response
   * (typical for AT-style protocols); adjust if the real device behaves differently. */
  const sendCommand = React.useCallback(
    async (command: string): Promise<SerialExchangeResult> => {
      if (!port || !port.writable || !port.readable) {
        throw new Error("Device not connected");
      }

      const writer = port.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(command));
      } finally {
        writer.releaseLock();
      }

      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      let response = "";
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
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
          // Stop as soon as a line terminator shows up rather than waiting out the full timeout.
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

      const trimmed = response.trim();
      return { atCommand: command, atResponse: trimmed, success: trimmed.length > 0 };
    },
    [port],
  );

  return { port, connected: !!port, connecting, connect, autoConnect, disconnect, sendCommand };
}
