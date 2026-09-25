import { forwardRef } from "react";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-ink-700 mb-1.5 tracking-tight">{label}</label>
      )}
      <input
        ref={ref}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors ${
          error ? "border-danger-300 bg-danger-50" : "border-surface-200 hover:border-surface-300"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-danger-600 font-medium">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-ink-700 mb-1.5 tracking-tight">{label}</label>
      )}
      <textarea
        ref={ref}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors ${
          error ? "border-danger-300 bg-danger-50" : "border-surface-200 hover:border-surface-300"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-danger-600 font-medium">{error}</p>}
    </div>
  )
);
TextArea.displayName = "TextArea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = "", children, ...props }, ref) => (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-ink-700 mb-1.5 tracking-tight">{label}</label>
      )}
      <select
        ref={ref}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors ${
          error ? "border-danger-300 bg-danger-50" : "border-surface-200 hover:border-surface-300"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-danger-600 font-medium">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";
