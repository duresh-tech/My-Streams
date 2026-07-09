import QRCode from "qrcode";

/**
 * Standard BHIM UPI deep-link parameters (NPCI spec). Only pa (payee VPA)
 * is truly mandatory per spec; am/cu are effectively required for a fixed-
 * amount QR to be meaningful. Everything else is optional context most PSPs
 * pass through unchanged.
 */
export interface UpiQrParams {
  pa: string; // payee VPA / UPI ID - required
  pn: string; // payee name - required (falls back to a generic label if blank)
  am: string; // amount - required
  tr?: string; // transaction reference number
  tn?: string; // transaction note / description
  tid?: string; // gateway transaction ID
  url?: string; // redirect URL
}

export function buildUpiUri(params: UpiQrParams): string {
  const query = new URLSearchParams();
  query.set("pa", params.pa);
  query.set("pn", params.pn || "Merchant");
  query.set("am", params.am);
  query.set("cu", "INR");
  if (params.tr) query.set("tr", params.tr);
  if (params.tn) query.set("tn", params.tn);
  if (params.tid) query.set("tid", params.tid);
  if (params.url) query.set("url", params.url);
  return `upi://pay?${query.toString()}`;
}

export function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text);
}
