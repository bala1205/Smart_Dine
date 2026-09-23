import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ListOrdered,
  QrCode,
  ClipboardList,
  Settings,
  LogOut,
  CookingPot,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { logoutUser } from "../services/authService";

const NAV = [
  { to: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/owner/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/owner/categories", label: "Categories", icon: ListOrdered },
  { to: "/owner/tables", label: "Tables & QR", icon: QrCode },
  { to: "/owner/orders", label: "Orders", icon: ClipboardList },
  { to: "/owner/staff", label: "Kitchen Staff", icon: CookingPot },
  { to: "/owner/settings", label: "Settings", icon: Settings },
];

export default function OwnerLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function handleLogout() {
    await logoutUser();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r border-gray-200 flex-col hidden md:flex fixed inset-y-0 left-0">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">
              SD
            </div>
            <div>
              <div className="font-bold text-gray-800 leading-none">Smart Dine</div>
              <div className="text-xs text-gray-400 mt-1">
                {profile?.restaurantId ? "Restaurant" : "Management"}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile top bar - fixed with safe-area handling */}
      <div className="owner-header md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
              SD
            </div>
            <span className="font-bold text-gray-800">Smart Dine</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 p-2 -mr-1"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="owner-nav scrollbar-none flex overflow-x-auto overflow-y-hidden px-2 pt-0 pb-2.5 gap-1 flex-nowrap items-center">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="owner-main flex-1 md:ml-64 mt-14 md:mt-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
