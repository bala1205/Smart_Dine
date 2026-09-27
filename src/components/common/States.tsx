import type { LucideIcon } from "lucide-react";
import { Inbox, TriangleAlert } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-8 px-4" : "py-14 sm:py-16 px-6"}`}
    >
      <div
        className={`${compact ? "w-12 h-12" : "w-14 h-14"} rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mb-4`}
        aria-hidden="true"
      >
        <Icon className={`${compact ? "w-6 h-6" : "w-7 h-7"} text-ink-400`} strokeWidth={1.75} />
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-ink-900">{title}</h3>
      {description && <p className="text-sm text-ink-500 mt-1.5 max-w-[38ch] leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center text-center py-14 sm:py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-danger-50 border border-danger-100 flex items-center justify-center mb-4" aria-hidden="true">
        <TriangleAlert className="w-7 h-7 text-danger-600" strokeWidth={1.75} />
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-ink-900">Something went wrong</h3>
      <p className="text-sm text-ink-500 mt-1.5 max-w-[42ch] leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="pressable mt-5 px-4 py-2.5 min-h-[42px] bg-ink-900 text-white rounded-xl text-sm font-semibold hover:bg-ink-700"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-lg ${className}`} />;
}

export function SkeletonRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-shimmer rounded-xl h-16 w-full" />
      ))}
    </div>
  );
}
