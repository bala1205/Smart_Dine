import { useEffect, useRef } from "react";

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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative bg-white rounded-t-2xl sm:rounded-2xl shadow-medium w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[92dvh] overflow-y-auto thin-scroll border border-surface-200 animate-modal-in`}
      >
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 border-b border-surface-100 sticky top-0 bg-white/95 backdrop-blur rounded-t-2xl sm:rounded-t-2xl z-10">
          <h3 className="text-[17px] font-bold tracking-tight text-ink-900 truncate">{title}</h3>
          <button
            ref={closeRef}
            onClick={onClose}
            className="pressable shrink-0 text-ink-400 hover:text-ink-700 p-2 -mr-1 rounded-xl hover:bg-surface-50 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
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
      <p className="text-sm leading-relaxed text-ink-500 max-w-[52ch]">{message}</p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="pressable px-4 py-2.5 rounded-xl text-sm font-semibold text-ink-700 bg-white border border-surface-200 hover:bg-surface-50 hover:border-surface-300 disabled:opacity-50 min-h-[42px]"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`pressable px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50 min-h-[42px] ${
            danger ? "bg-danger-600 hover:bg-danger-700 active:bg-danger-700" : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
