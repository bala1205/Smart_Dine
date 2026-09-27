import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-surface-50 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 sm:mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-ink-900 flex items-center justify-center text-white text-xl font-bold tracking-tight shadow-card mb-4" aria-hidden="true">
            SD
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">Smart Dine</h1>
          <p className="text-sm text-ink-500 mt-1">Restaurant OS for owners, staff & guests</p>
          {subtitle && <p className="text-sm text-ink-500 mt-1 max-w-[38ch]">{subtitle}</p>}
        </div>
        <main className="bg-white rounded-2xl shadow-card border border-surface-200 p-5 sm:p-7">
          <h2 className="text-lg font-bold tracking-tight text-ink-900 mb-5">{title}</h2>
          {children}
        </main>
        <p className="mt-6 text-center text-xs text-ink-400">Secure sign-in • Your data stays protected</p>
      </div>
    </div>
  );
}
