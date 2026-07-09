/**
 * Serial settings and AT audio commands for the Bonrix DQ12, captured from
 * Bonrix's own working browser test pages (confirmed against a real device -
 * Bonrix itself publishes no protocol spec). Screen content is pushed as a
 * raw RGB565 bitmap (see lib/dq12-display-image.ts), not text AT commands -
 * only audio playback goes over the AT command channel.
 */

export const DQ12_SERIAL_OPTIONS: SerialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

/** From Bonrix's own reference page - marked there as an example ID, so this
 * is a best-effort filter only. autoConnect() falls back to "first granted
 * port" when nothing matches, so an inaccurate ID here just skips the filter
 * rather than breaking the connection. */
export const DQ12_USB_FILTER = {
  usbVendorId: 0x0483,
  usbProductId: 0x5740,
};

/** Audio clip numbers as used by Bonrix's own demo pages - confirmed mapping,
 * not a guess (index 1 was unused in the reference source). */
export const DQ12_AUDIO_CLIP = {
  WELCOME: 0,
  PENDING: 2,
  SUCCESS: 3,
  FAIL: 4,
  CANCEL: 5,
  QR_SCAN: 6,
} as const;

export function buildAudioCommand(clip: number): string {
  return `AT+CODEC_TEST=${clip}\r\n`;
}
