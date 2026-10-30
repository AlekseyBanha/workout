import { NavLink, Outlet, useLocation } from "react-router";
import { uk } from "../i18n/uk.ts";
import { useAuth } from "../lib/auth.tsx";
import { IconAdmin, IconCatalog, IconHistory, IconWorkout } from "./icons.tsx";
import { cx, Logo } from "./ui.tsx";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium",
    isActive ? "text-lime" : "text-muted",
  );

export function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const adminSection = location.pathname.startsWith("/admin");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-semibold">{uk.appName}</span>
          </div>
          <button type="button" className="inline-flex h-9 items-center rounded-full border border-line bg-panel px-3 text-sm font-medium" onClick={() => void signOut()}>
            {uk.logout}
          </button>
        </div>
        {adminSection && profile?.role === "admin" ? (
          <nav className="mx-auto flex w-full max-w-3xl gap-2 pb-3">
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                cx("rounded-full px-3 py-1.5 text-sm", isActive ? "bg-lime text-ink" : "bg-panel text-muted")
              }
            >
              {uk.admin.users}
            </NavLink>
            <NavLink
              to="/admin/exercises"
              className={({ isActive }) =>
                cx("rounded-full px-3 py-1.5 text-sm", isActive ? "bg-lime text-ink" : "bg-panel text-muted")
              }
            >
              {uk.admin.exercises}
            </NavLink>
          </nav>
        ) : null}
      </header>
      <main className={cx("mx-auto w-full px-4 pb-28 pt-4", adminSection ? "max-w-3xl" : "max-w-lg")}>
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          <NavLink to="/exercises" className={linkClass}>
            <IconCatalog />
            {uk.nav.exercises}
          </NavLink>
          <NavLink to={location.pathname === "/workout" ? `/workout${location.search}` : "/workout"} className={linkClass}>
            <IconWorkout />
            {uk.nav.workout}
          </NavLink>
          <NavLink to="/history" className={linkClass}>
            <IconHistory />
            {uk.nav.history}
          </NavLink>
          {profile?.role === "admin" ? (
            <NavLink to="/admin/users" className={linkClass}>
              <IconAdmin />
              {uk.nav.admin}
            </NavLink>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
