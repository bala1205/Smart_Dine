import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BellRing, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { logoutUser } from "../services/authService";

const NAV = [
  { to: "/waiter/dashboard", label: "Requests", icon: BellRing },
  { to: "/waiter/tables", label: "Tables", icon: LayoutDashboard },
];

export default function WaiterLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="w-64 bg-white border-r border-surface-200 flex-col hidden md:flex fixed inset-y-0 left-0 shadow-card" aria-label="Waiter navigation">
        <div className="px-6 py-5 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-ink-900 flex items-center justify-center text-white text-sm font-bold shrink-0" aria-hidden="true">SD</div>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-ink-900 leading-none">Smart Dine</div>
              <div className="text-xs font-medium text-ink-500 mt-1 truncate">Waiter • {profile?.fullName?.split(" ")[0] || "Staff"}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto thin-scroll" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `pressable flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                  isActive ? "bg-ink-900 text-white shadow-sm" : "text-ink-500 hover:bg-surface-50 hover:text-ink-900"
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-surface-100">
          <button onClick={handleLogout} className="pressable flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-ink-500 hover:bg-surface-50 hover:text-ink-900 min-h-[42px]">
            <LogOut className="w-5 h-5" aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-surface-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-ink-900 flex items-center justify-center text-white font-bold text-[13px]" aria-hidden="true">SD</div>
            <span className="font-bold tracking-tight text-ink-900">Waiter</span>
          </div>
          <button onClick={handleLogout} aria-label="Log out" className="pressable text-ink-400 hover:text-ink-700 p-2 -mr-1 rounded-xl hover:bg-surface-50 min-w-[40px] min-h-[40px] flex items-center justify-center">
            <LogOut className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Primary mobile" className="flex overflow-x-auto scrollbar-none px-3 pb-2.5 gap-1.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border ${
                  isActive ? "bg-ink-900 text-white border-ink-900" : "bg-white text-ink-500 border-surface-200"
                }`
              }
            >
              <item.icon className="w-3.5 h-3.5" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main id="main-content" className="flex-1 md:ml-64 mt-20 md:mt-0 min-w-0">
        <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
