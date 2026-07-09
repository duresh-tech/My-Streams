/**
 * AT commands and serial settings for the Bonrix DQ12, captured from Bonrix's
 * own working browser test pages (confirmed against a real device - Bonrix
 * itself publishes no protocol spec). Commands are terminated with \r\n.
 */

export const DQ12_SERIAL_OPTIONS: SerialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

/** The device renders the QR itself from the given text/URL - no bitmap push needed. */
export function buildShowQrCommand(upiLink: string, size = 300): string {
  return `AT+QR_DISPLAY=${size},${upiLink}\r\n`;
}

export function buildAmountCommand(amount: number, line = 0): string {
  return `AT+STR_DISPLAY=${line},₹${amount.toFixed(2)}\r\n`;
}

export function buildClearCommand(): string {
  return `AT+DISPLAY_CLEAR\r\n`;
}

/** "Test" = ask for firmware version - a real round trip that confirms the link is alive,
 * rather than a made-up command the device would just ignore. */
export function buildTestCommand(): string {
  return `AT+VER\r\n`;
}

/** clip is device-defined (0-6 in Bonrix's own demo: welcome/success/fail/pending/cancel/qr-scan). */
export function buildAudioCommand(clip: number): string {
  return `AT+CODEC_TEST=${clip}\r\n`;
}

export function buildBacklightCommand(level: number): string {
  return `AT+BKL=${level}\r\n`;
}

export function buildVolumeCommand(level: number): string {
  return `AT+VOL=${level}\r\n`;
}
