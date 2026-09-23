import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import CompleteSetup from "../pages/auth/CompleteSetup";
import type { UserRole } from "../types/auth";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // A signed-in user with no Firestore profile was left orphaned by an earlier
  // registration that failed after the Auth user was created. Route them to a
  // recovery screen that completes their setup instead of trapping them in a
  // login loop (they can no longer register: email already in use).
  if (!profile) {
    return <CompleteSetup />;
  }

  return <>{children}</>;
}

export function RoleRoute({
  children,
  role,
}: {
  children: ReactNode;
  role: UserRole;
}) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (profile.role !== role) {
    return <Navigate to={profile.role === "OWNER" ? "/owner/dashboard" : "/kitchen/dashboard"} replace />;
  }

  if (location.pathname.startsWith(`/${role.toLowerCase()}`) && profile.restaurantId) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
