interface QrDisplayPreviewProps {
  qrDataUrl: string;
  amount: number;
  note?: string;
  isTest?: boolean;
  deviceName: string;
}

/** Renders roughly what a QR display device's screen would show: the generated
 * QR, amount, and device name. Used by both the "Test" preview and the
 * "Collect Payment" (push) result. */
export function QrDisplayPreview({ qrDataUrl, amount, note, isTest, deviceName }: QrDisplayPreviewProps) {
  return (
    <div className="relative mx-auto flex aspect-[9/16] w-full max-w-xs flex-col items-center justify-between overflow-hidden rounded-2xl border bg-slate-900 p-6 text-center text-white shadow-lg">
      {isTest && (
        <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
          TEST
        </span>
      )}

      <div className="text-sm font-medium opacity-80">{deviceName}</div>

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Payment QR code" className="size-48" />
        </div>
        <div className="text-2xl font-bold">₹{amount.toFixed(2)}</div>
        {note && <div className="text-sm opacity-80">{note}</div>}
      </div>

      <div className="text-xs opacity-70">Scan to pay</div>
    </div>
  );
}
