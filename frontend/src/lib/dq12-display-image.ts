/**
 * Renders full-screen bitmaps for the Bonrix DQ12 (320x480 TFT) and converts
 * them to the raw RGB565 byte stream the device expects over serial - ported
 * from Bonrix's own reference page (canvas -> getImageData -> 16-bit pack).
 * Background art comes from the App Settings qr_device.dq12.* keys rather
 * than Bonrix's own CDN; any key left unconfigured falls back to a plain
 * dark screen with centered label text so the feature works before anyone
 * uploads branded art.
 */

import { UPLOADS_ORIGIN } from "@/lib/api";

export const DQ12_SCREEN_WIDTH = 320;
export const DQ12_SCREEN_HEIGHT = 480;

const imageCache = new Map<string, HTMLImageElement>();

/** App Settings returns bare storage paths (e.g. "app_settings_uploads/xyz.png"),
 * not full URLs - resolve those against the uploads origin; data:/http(s): URLs
 * (the QR code itself, or a future absolute URL) pass through unchanged. */
function toAssetUrl(path: string): string {
  if (/^(https?:|data:)/.test(path)) return path;
  return `${UPLOADS_ORIGIN}/uploads/${path}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageCache.set(url, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  text: string,
  y: number,
  font: string,
  color = "#000000",
) {
  ctx.font = font;
  ctx.fillStyle = color;
  const width = ctx.measureText(text).width;
  ctx.fillText(text, (canvasWidth - width) / 2, y);
}

/** Draws a background image (or a solid fallback) onto a fresh 320x480 canvas,
 * then hands off to an optional overlay callback for text/QR compositing.
 * The overlay gets a textColor matching whichever background was used, so
 * amount/reason text stays readable whether or not real art is configured. */
async function renderScreen(
  backgroundUrl: string | null | undefined,
  fallbackLabel: string,
  overlay?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, textColor: string) => void,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = DQ12_SCREEN_WIDTH;
  canvas.height = DQ12_SCREEN_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  let textColor = "#000000";
  if (backgroundUrl) {
    const image = await loadImage(toAssetUrl(backgroundUrl));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    textColor = "#ffffff";
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCenteredText(ctx, canvas.width, fallbackLabel, canvas.height / 2, "bold 22px Arial", textColor);
  }

  overlay?.(ctx, canvas, textColor);
  return canvas;
}

export function renderWelcomeScreen(backgroundUrl?: string | null): Promise<HTMLCanvasElement> {
  return renderScreen(backgroundUrl, "WELCOME");
}

export function renderSuccessScreen(backgroundUrl: string | null | undefined, amount: number): Promise<HTMLCanvasElement> {
  return renderScreen(backgroundUrl, "PAYMENT SUCCESS", (ctx, canvas, textColor) => {
    drawCenteredText(ctx, canvas.width, `₹ ${amount.toFixed(2)}`, canvas.height / 2 + 40, "20px Arial", textColor);
  });
}

export function renderPendingScreen(backgroundUrl: string | null | undefined, amount: number): Promise<HTMLCanvasElement> {
  return renderScreen(backgroundUrl, "PENDING", (ctx, canvas, textColor) => {
    drawCenteredText(ctx, canvas.width, `₹ ${amount.toFixed(2)}`, canvas.height / 2 + 40, "20px Arial", textColor);
  });
}

export function renderFailScreen(backgroundUrl: string | null | undefined, reason?: string): Promise<HTMLCanvasElement> {
  return renderScreen(backgroundUrl, "PAYMENT FAILED", reason
    ? (ctx, canvas, textColor) => drawCenteredText(ctx, canvas.width, `Reason: ${reason}`, canvas.height / 2 + 40, "18px Arial", textColor)
    : undefined);
}

export function renderCancelScreen(backgroundUrl?: string | null): Promise<HTMLCanvasElement> {
  return renderScreen(backgroundUrl, "PAYMENT CANCELLED");
}

/** Mirrors Bonrix's generateQr/loadQrBackground: background + centered QR + amount/VPA text. */
export async function renderQrScreen(options: {
  backgroundUrl?: string | null;
  qrDataUrl: string;
  amount: number;
  vpa?: string | null;
}): Promise<HTMLCanvasElement> {
  const { backgroundUrl, qrDataUrl, amount, vpa } = options;
  const qrImage = await loadImage(qrDataUrl);
  const qrSize = 280;

  return renderScreen(backgroundUrl, "SCAN TO PAY", (ctx, canvas, textColor) => {
    const startX = (canvas.width - qrSize) / 2;
    const startY = (canvas.height - qrSize) / 2;
    ctx.drawImage(qrImage, startX, startY, qrSize, qrSize);
    drawCenteredText(ctx, canvas.width, `₹ ${amount.toFixed(2)}`, 100, "20px Arial", textColor);
    if (vpa) {
      drawCenteredText(ctx, canvas.width, `UPI ID: ${vpa}`, 400, "15px Arial", textColor);
    }
  });
}

/** Converts a canvas's pixels to the 16-bit RGB565 byte stream the DQ12 expects,
 * bottom-up (matches Bonrix's own reference conversion). */
export function canvasToRgb565(canvas: HTMLCanvasElement): Uint8Array {
  const { width, height } = canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const bytes = new Uint8Array(width * height * 2);
  let index = 0;
  for (let i = height - 1; i >= 0; i--) {
    for (let j = 0; j < width; j++) {
      const pos = (i * width + j) * 4;
      const r = (imageData[pos] >> 3) & 31;
      const g = (imageData[pos + 1] >> 2) & 63;
      const b = (imageData[pos + 2] >> 3) & 31;
      const rgb565 = (r << 11) | (g << 5) | b;
      bytes[index++] = rgb565 >> 8;
      bytes[index++] = rgb565 & 0xff;
    }
  }
  return bytes;
}
