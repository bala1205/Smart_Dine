import { forwardRef } from "react";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, helper, required, disabled, className = "", id, ...props }, ref) => {
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink-700 mb-1.5 tracking-tight">
            {label}
            {required && (
              <span className="text-danger-600 ml-0.5" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
          className={`w-full px-3.5 py-2.5 min-h-[42px] rounded-xl border text-sm text-ink-900 bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors disabled:bg-surface-50 disabled:text-ink-400 disabled:cursor-not-allowed ${
            error ? "border-danger-500 bg-danger-50" : "border-surface-200 hover:border-surface-300"
          } ${className}`}
          {...props}
        />
        {helper && !error && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-ink-500 leading-relaxed">{helper}</p>
        )}
        {error && <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-danger-600 font-medium leading-relaxed">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, helper, required, disabled, className = "", id, ...props }, ref) => {
    const inputId = id ?? (label ? `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink-700 mb-1.5 tracking-tight">
            {label}
            {required && <span className="text-danger-600 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-ink-900 bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors disabled:bg-surface-50 disabled:cursor-not-allowed ${
            error ? "border-danger-500 bg-danger-50" : "border-surface-200 hover:border-surface-300"
          } ${className}`}
          {...props}
        />
        {helper && !error && <p className="mt-1.5 text-xs text-ink-500">{helper}</p>}
        {error && <p role="alert" className="mt-1.5 text-xs text-danger-600 font-medium">{error}</p>}
      </div>
    );
  }
);
TextArea.displayName = "TextArea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, required, disabled, className = "", id, children, ...props }, ref) => {
    const inputId = id ?? (label ? `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink-700 mb-1.5 tracking-tight">
            {label}
            {required && <span className="text-danger-600 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={`w-full px-3.5 py-2.5 min-h-[42px] rounded-xl border text-sm text-ink-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors disabled:bg-surface-50 disabled:cursor-not-allowed ${
            error ? "border-danger-500 bg-danger-50" : "border-surface-200 hover:border-surface-300"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p role="alert" className="mt-1.5 text-xs text-danger-600 font-medium">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";
