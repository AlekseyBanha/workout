import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { uk } from "../i18n/uk.ts";
import { useAuth } from "../lib/auth.tsx";
import { IconAdmin, IconCatalog, IconHistory, IconWorkout } from "./icons.tsx";
import { cx, Logo } from "./ui.tsx";

const SCROLL_KEY = "screen-scroll";

function readScrolls(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function readScroll(path: string): number {
  return readScrolls()[path] ?? 0;
}

function writeScroll(path: string, top: number) {
  try {
    const map = readScrolls();
    if (top <= 0) delete map[path];
    else map[path] = top;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    // Private mode or a full quota should not block scrolling.
  }
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium",
    isActive ? "text-lime" : "text-muted",
  );

export function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const adminSection = location.pathname.startsWith("/admin");
  const mainRef = useRef<HTMLElement>(null);
  const scrollKey = `${location.pathname}${location.search}`;

  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const saved = readScroll(scrollKey);
    let settled = false;
    let restoring = false;
    let remembered = saved;
    let gesture = false;
    let gestureTimer = 0;

    const applyScroll = (top: number) => {
      const max = Math.max(0, main.scrollHeight - main.clientHeight);
      if (top > 0 && max + 1 < top) return false;
      restoring = true;
      if (main.scrollTop !== top) main.scrollTop = top;
      restoring = false;
      return true;
    };

    const restore = () => {
      if (settled) return;
      if (!applyScroll(saved)) return;
      settled = true;
    };

    const persist = (top: number) => {
      remembered = top;
      writeScroll(scrollKey, top);
    };

    const armGesture = () => {
      settled = true;
      gesture = true;
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(() => {
        gesture = false;
      }, 1200);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "PageDown" || event.key === "PageUp" || event.key === "Home" || event.key === "End" || event.key === " ") {
        armGesture();
      }
    };

    const onScroll = () => {
      if (restoring || !settled) return;
      if (gesture) armGesture();
      if (document.hidden) return;
      if (!gesture && main.scrollTop === 0 && remembered > 0) return;
      persist(main.scrollTop);
    };

    const onHide = () => {
      if (!settled || restoring || main.scrollTop <= 0) return;
      persist(main.scrollTop);
    };

    const onShow = () => {
      const stored = readScroll(scrollKey);
      if (stored <= 0 || Math.abs(main.scrollTop - stored) < 2) return;
      applyScroll(stored);
    };

    const onVisibility = () => {
      if (document.hidden) onHide();
      else onShow();
    };

    restore();
    const observer = new ResizeObserver(() => restore());
    observer.observe(main);
    const content = main.firstElementChild;
    if (content) observer.observe(content);

    main.addEventListener("scroll", onScroll, { passive: true });
    main.addEventListener("wheel", armGesture, { passive: true });
    main.addEventListener("touchstart", armGesture, { passive: true });
    main.addEventListener("pointerdown", armGesture);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(gestureTimer);
      observer.disconnect();
      main.removeEventListener("scroll", onScroll);
      main.removeEventListener("wheel", armGesture);
      main.removeEventListener("touchstart", armGesture);
      main.removeEventListener("pointerdown", armGesture);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("keydown", onKey);
    };
  }, [scrollKey]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-ink/90 px-4 pt-[env(safe-area-inset-top)]">
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
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className={cx("mx-auto w-full px-4 py-4", adminSection ? "max-w-3xl" : "max-w-lg")}>
          <Outlet />
        </div>
      </main>
      <nav className="shrink-0 border-t border-line bg-ink pb-[env(safe-area-inset-bottom)]">
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
