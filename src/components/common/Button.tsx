import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm hover:shadow focus-visible:ring-brand-500 border border-transparent",
  secondary:
    "bg-white text-ink-700 border border-surface-200 hover:bg-surface-50 hover:border-surface-300 active:bg-surface-100",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-700 shadow-sm border border-transparent",
  ghost: "text-ink-500 hover:bg-surface-50 hover:text-ink-900 border border-transparent",
  outline:
    "border border-surface-200 text-ink-700 hover:bg-surface-50 hover:border-surface-300 bg-white active:bg-surface-100",
};

const SIZES: Record<string, string> = {
  sm: "px-3 py-1.5 text-[13px] min-h-[34px]",
  md: "px-4 py-2.5 text-sm min-h-[42px]",
  lg: "px-5 py-3 text-[15px] min-h-[48px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`pressable inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
