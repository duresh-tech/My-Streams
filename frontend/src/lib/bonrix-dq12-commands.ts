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

/** The device renders the QR itself from the given text/URL - no bitmap push needed. */
export function buildShowQrCommand(upiLink: string, size = 300): string {
  return `AT+QR_DISPLAY=${size},${upiLink}\r\n`;
}

export function buildTextCommand(line: number, text: string): string {
  return `AT+STR_DISPLAY=${line},${text}\r\n`;
}

export function buildAmountCommand(amount: number, line = 0): string {
  return buildTextCommand(line, `₹${amount.toFixed(2)}`);
}

export function buildClearCommand(): string {
  return `AT+DISPLAY_CLEAR\r\n`;
}

/** "Test" = ask for firmware version - a real round trip that confirms the link is alive,
 * rather than a made-up command the device would just ignore. */
export function buildTestCommand(): string {
  return `AT+VER\r\n`;
}

export function buildAudioCommand(clip: number): string {
  return `AT+CODEC_TEST=${clip}\r\n`;
}

export function buildBacklightCommand(level: number): string {
  return `AT+BKL=${level}\r\n`;
}

export function buildVolumeCommand(level: number): string {
  return `AT+VOL=${level}\r\n`;
}

// ---------- Canned demo scenes for the Test panel ----------
// These are fire-and-forget (display/audio) - don't expect a serial reply,
// success just means the write went through; watch the physical screen/speaker.

export function buildWelcomeCommands(): string[] {
  return [buildClearCommand(), buildTextCommand(0, "WELCOME"), buildAudioCommand(DQ12_AUDIO_CLIP.WELCOME)];
}

export function buildPaymentSuccessCommands(amount: number): string[] {
  return [
    buildClearCommand(),
    buildTextCommand(0, "PAYMENT SUCCESS"),
    buildAmountCommand(amount, 1),
    buildAudioCommand(DQ12_AUDIO_CLIP.SUCCESS),
  ];
}

export function buildPaymentFailedCommands(): string[] {
  return [buildClearCommand(), buildTextCommand(0, "PAYMENT FAILED"), buildAudioCommand(DQ12_AUDIO_CLIP.FAIL)];
}

export function buildPaymentCancelledCommands(): string[] {
  return [buildClearCommand(), buildTextCommand(0, "PAYMENT CANCELLED"), buildAudioCommand(DQ12_AUDIO_CLIP.CANCEL)];
}
