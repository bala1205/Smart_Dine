import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, RoleRoute } from "./ProtectedRoute";
import { useAuth } from "../hooks/useAuth";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import ForgotPassword from "../pages/auth/ForgotPassword";

import OwnerLayout from "../layouts/OwnerLayout";
import OwnerDashboard from "../pages/owner/Dashboard";
import OwnerMenu from "../pages/owner/Menu";
import OwnerCategories from "../pages/owner/Categories";
import OwnerTables from "../pages/owner/Tables";
import OwnerOrders from "../pages/owner/Orders";
import OwnerStaff from "../pages/owner/Staff";
import OwnerSettings from "../pages/owner/Settings";
import OwnerAnalytics from "../pages/owner/Analytics";
import OwnerReports from "../pages/owner/Reports";

import KitchenLayout from "../layouts/KitchenLayout";
import KitchenDashboard from "../pages/kitchen/Dashboard";
import KitchenOrders from "../pages/kitchen/Orders";

import WaiterLayout from "../layouts/WaiterLayout";
import WaiterDashboard from "../pages/waiter/Dashboard";

import CustomerMenu from "../pages/customer/Menu";
import CustomerCheckout from "../pages/customer/Checkout";
import CustomerOrderTracking from "../pages/customer/OrderTracking";
import InvalidTable from "../pages/customer/InvalidTable";
import DigitalBill from "../pages/customer/Bill";
import BillShare from "../pages/customer/BillShare";

function HomeRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  // Signed-in user with no profile = orphaned account; send through
  // ProtectedRoute which will show the recovery screen instead of a login loop.
  if (user && !profile) return <Navigate to="/owner" replace />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role === "OWNER") return <Navigate to="/owner/dashboard" replace />;
  if (profile.role === "WAITER") return <Navigate to="/waiter/dashboard" replace />;
  return <Navigate to="/kitchen/dashboard" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/owner"
        element={
          <ProtectedRoute>
            <RoleRoute role="OWNER">
              <OwnerLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<OwnerDashboard />} />
        <Route path="menu" element={<OwnerMenu />} />
        <Route path="categories" element={<OwnerCategories />} />
        <Route path="tables" element={<OwnerTables />} />
        <Route path="orders" element={<OwnerOrders />} />
        <Route path="staff" element={<OwnerStaff />} />
        <Route path="analytics" element={<OwnerAnalytics />} />
        <Route path="reports" element={<OwnerReports />} />
        <Route path="settings" element={<OwnerSettings />} />
      </Route>

      <Route
        path="/kitchen"
        element={
          <ProtectedRoute>
            <RoleRoute role="KITCHEN">
              <KitchenLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<KitchenDashboard />} />
        <Route path="orders" element={<KitchenOrders />} />
      </Route>

      <Route
        path="/waiter"
        element={
          <ProtectedRoute>
            <RoleRoute role="WAITER">
              <WaiterLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<WaiterDashboard />} />
        <Route path="tables" element={<OwnerTables />} />
      </Route>

      <Route
        path="/menu/:restaurantId/:tableId"
        element={<CustomerMenu />}
      />
      <Route
        path="/checkout"
        element={<CustomerCheckout />}
      />
      <Route path="/order/:orderId" element={<CustomerOrderTracking />} />
      <Route path="/bill/:restaurantId/:orderId" element={<DigitalBill />} />
      <Route path="/bill/:restaurantId/:orderId/share" element={<BillShare />} />
      <Route path="/menu/invalid/invalid" element={<InvalidTable />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
