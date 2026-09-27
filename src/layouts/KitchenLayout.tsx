import { Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { logoutUser } from "../services/authService";

export default function KitchenLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-surface-50 overflow-x-hidden">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="kitchen-header bg-white/95 backdrop-blur border-b border-surface-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-ink-900 flex items-center justify-center text-white text-sm font-bold shrink-0" aria-hidden="true">
              SD
            </div>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-ink-900 leading-none">Smart Dine</div>
              <div className="text-xs font-medium text-ink-500 mt-1">Kitchen display</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {profile && (
              <span className="hidden sm:inline text-sm font-medium text-ink-500 max-w-[180px] truncate">
                {profile.fullName}
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1" role="status">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
              Live
            </span>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="pressable flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900 bg-white border border-surface-200 hover:border-surface-300 hover:bg-surface-50 px-3 py-2 min-h-[38px] rounded-xl"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="max-w-6xl mx-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
