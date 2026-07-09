import { UPLOADS_ORIGIN } from "@/lib/api";

export interface QrDisplayTemplateInfo {
  templateName?: string;
  backgroundImagePath?: string | null;
  logoOverridePath?: string | null;
  primaryColor?: string | null;
  footerText?: string | null;
}

interface QrDisplayPreviewProps {
  qrDataUrl: string;
  amount: number;
  note?: string;
  isTest?: boolean;
  deviceName: string;
  template?: QrDisplayTemplateInfo | null;
}

/** Renders exactly what a QR display device's screen would show: background/logo
 * from the chosen template, the generated QR, amount, and footer text. Used by
 * both the "Test" preview and the "Collect Payment" (push) result. */
export function QrDisplayPreview({ qrDataUrl, amount, note, isTest, deviceName, template }: QrDisplayPreviewProps) {
  const backgroundStyle = template?.backgroundImagePath
    ? {
        backgroundImage: `url(${UPLOADS_ORIGIN}/uploads/${template.backgroundImagePath})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: template?.primaryColor || "#0f172a" };

  return (
    <div
      className="relative mx-auto flex aspect-[9/16] w-full max-w-xs flex-col items-center justify-between overflow-hidden rounded-2xl border p-6 text-center text-white shadow-lg"
      style={backgroundStyle}
    >
      {isTest && (
        <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
          TEST
        </span>
      )}

      {template?.logoOverridePath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${UPLOADS_ORIGIN}/uploads/${template.logoOverridePath}`}
          alt="Logo"
          className="h-10 max-w-[60%] object-contain"
        />
      ) : (
        <div className="text-sm font-medium opacity-80">{deviceName}</div>
      )}

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Payment QR code" className="size-48" />
        </div>
        <div className="text-2xl font-bold">₹{amount.toFixed(2)}</div>
        {note && <div className="text-sm opacity-80">{note}</div>}
      </div>

      <div className="text-xs opacity-70">{template?.footerText || "Scan to pay"}</div>
    </div>
  );
}
