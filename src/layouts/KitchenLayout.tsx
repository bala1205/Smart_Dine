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
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      <header className="kitchen-header bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">
              SD
            </div>
            <div>
              <div className="font-bold text-gray-800 leading-none">Smart Dine</div>
              <div className="text-xs text-gray-500 mt-1">Kitchen</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile && (
              <span className="hidden sm:inline text-sm text-gray-600">
                {profile.fullName}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
