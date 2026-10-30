import { Navigate, Outlet } from "react-router";
import { uk } from "../i18n/uk.ts";
import { useAuth } from "../lib/auth.tsx";
import { ErrorState, Loading } from "./ui.tsx";

export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { session, profile, loading, profileError } = useAuth();

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profileError || !profile) {
    return (
      <div className="mx-auto h-full max-w-lg overflow-y-auto px-4 py-10">
        <ErrorState message={uk.errors.profile} />
      </div>
    );
  }
  if (admin && profile.role !== "admin") return <Navigate to="/exercises" replace />;
  return <Outlet />;
}
