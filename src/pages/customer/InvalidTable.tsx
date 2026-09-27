import { QrCode } from "lucide-react";

export default function InvalidTable() {
  return (
    <div className="min-h-[100dvh] bg-surface-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
          <QrCode className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Table not available</h1>
        <p className="text-sm text-ink-500 mt-2 leading-relaxed">
          This QR code is invalid or inactive. Please contact restaurant staff.
        </p>
      </div>
    </div>
  );
}
