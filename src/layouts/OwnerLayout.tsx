import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ListOrdered,
  QrCode,
  ClipboardList,
  ClipboardCheck,
  Settings,
  LogOut,
  CookingPot,
  BarChart3,
  FileText,
  BellRing,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useRealtimeServiceRequests } from "../hooks/useServiceRequests";
import { logoutUser } from "../services/authService";

const NAV_GROUPS = [
  {
    title: "Overview",
    items: [{ to: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Operations",
    items: [
      { to: "/owner/orders", label: "Orders", icon: ClipboardList },
      { to: "/owner/service-requests", label: "Service Requests", icon: BellRing },
      { to: "/owner/tables", label: "Tables", icon: QrCode },
      { to: "/owner/table-check", label: "Table Check", icon: ClipboardCheck },
    ],
  },
  {
    title: "Restaurant",
    items: [
      { to: "/owner/menu", label: "Menu", icon: UtensilsCrossed },
      { to: "/owner/categories", label: "Categories", icon: ListOrdered },
      { to: "/owner/staff", label: "Staff", icon: CookingPot },
    ],
  },
  {
    title: "Insights",
    items: [
      { to: "/owner/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/owner/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Settings",
    items: [{ to: "/owner/settings", label: "Settings", icon: Settings }],
  },
];

export default function OwnerLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { requests: pendingRequests } = useRealtimeServiceRequests(
    profile?.restaurantId ?? null,
    "PENDING"
  );
  const pendingCount = pendingRequests.length;

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="w-[280px] bg-white border-r border-surface-200 flex-col hidden md:flex fixed inset-y-0 left-0 shadow-card" aria-label="Owner navigation">
        <div className="px-6 py-6 border-b border-surface-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ink-900 flex items-center justify-center text-white text-sm font-bold tracking-tight shadow-sm" aria-hidden="true">
              SD
            </div>
            <div>
              <div className="font-bold tracking-tight text-ink-900 leading-none">Smart Dine</div>
              <div className="text-xs font-medium text-ink-500 mt-1">
                {profile?.restaurantId ? "Restaurant OS" : "Management"}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-7 overflow-y-auto thin-scroll" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-3 mb-2 text-[11px] font-bold tracking-[0.08em] uppercase text-ink-400">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const showBadge = item.to === "/owner/service-requests" && pendingCount > 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      aria-label={
                        showBadge
                          ? `${item.label}, ${pendingCount} pending`
                          : undefined
                      }
                      className={({ isActive }) =>
                        `pressable flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                          isActive
                            ? "bg-ink-900 text-white shadow-sm"
                            : "text-ink-500 hover:bg-surface-50 hover:text-ink-900"
                        }`
                      }
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      {showBadge && (
                        <span
                          className="min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-[11px] font-bold tabular-nums"
                          aria-hidden="true"
                        >
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-surface-100">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-50 border border-surface-200 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
              {profile?.fullName?.charAt(0) || "O"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink-900 truncate">{profile?.fullName || "Owner"}</div>
              <div className="text-xs text-ink-500 truncate">{profile?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-ink-500 hover:bg-surface-50 hover:text-ink-900 transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="owner-header md:hidden fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-surface-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-ink-900 flex items-center justify-center text-white font-bold text-[13px]" aria-hidden="true">
              SD
            </div>
            <span className="font-bold tracking-tight text-ink-900">Smart Dine</span>
          </div>
          <button
            onClick={handleLogout}
            className="pressable text-ink-400 hover:text-ink-700 p-2 -mr-1 rounded-xl hover:bg-surface-50 min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Log out"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Primary mobile" className="owner-nav scrollbar-none flex overflow-x-auto overflow-y-hidden px-3 pt-0 pb-3 gap-1.5 flex-nowrap items-center">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const showBadge = item.to === "/owner/service-requests" && pendingCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={
                  showBadge
                    ? `${item.label}, ${pendingCount} pending`
                    : undefined
                }
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                    isActive ? "bg-ink-900 text-white border-ink-900" : "text-ink-500 bg-white border-surface-200 hover:border-surface-300"
                  }`
                }
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {item.label}
                {showBadge && (
                  <span
                    className="min-w-[20px] h-5 px-1 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-[11px] font-bold tabular-nums"
                    aria-hidden="true"
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <main id="main-content" className="owner-main flex-1 md:ml-[280px] mt-14 md:mt-0 bg-surface-50 min-h-screen">
        <div className="p-4 sm:p-6 md:p-8 lg:p-10 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
