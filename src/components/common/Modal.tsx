export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-white rounded-3xl shadow-medium w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto border border-surface-200 animate-in fade-in zoom-in duration-200`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-100">
          <h3 className="text-lg font-bold tracking-tight text-ink-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 p-2 rounded-xl hover:bg-surface-50 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm leading-relaxed text-ink-500">{message}</p>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-ink-700 bg-white border border-surface-200 hover:bg-surface-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors ${
            danger ? "bg-danger-600 hover:bg-danger-700" : "bg-brand-600 hover:bg-brand-700"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
