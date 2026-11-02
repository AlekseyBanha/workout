import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { uk } from "../../i18n/uk.ts";
import { attachLockScreenRest, notifyRestDone, REST_MS, syncLockScreenRest } from "../../lib/lock-screen-rest.ts";
import { chipButton } from "../ui.tsx";

export { REST_MS };

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function RestTimer({ until, onClose }: { until: number; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const vibratedFor = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [until]);

  useEffect(() => attachLockScreenRest(() => onCloseRef.current()), []);
  useEffect(() => {
    syncLockScreenRest(until);
  }, [until]);

  const remaining = Math.max(0, until - now);
  const done = remaining === 0;
  const label = formatClock(done ? 0 : Math.ceil(remaining / 1000));

  useEffect(() => {
    if (!done || vibratedFor.current === until) return;
    vibratedFor.current = until;
    if (typeof navigator.vibrate === "function") navigator.vibrate([180, 80, 180]);
    notifyRestDone(until);
  }, [done, until]);

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    document.title = done ? `${uk.workout.restDone} · ${uk.appName}` : `${label} · ${uk.workout.rest}`;
  }, [done, label]);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
      <div
        role="timer"
        aria-label={done ? uk.workout.restDone : `${uk.workout.rest} ${label}`}
        className="pointer-events-auto w-full max-w-lg rounded-2xl border border-lime/40 bg-panel px-4 py-3 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted">{uk.workout.rest}</p>
            <p className={`font-semibold tabular-nums ${done ? "text-lg text-lime" : "text-3xl text-white"}`}>
              {done ? uk.workout.restDone : label}
            </p>
          </div>
          <button type="button" className={chipButton} onClick={onClose}>
            {uk.workout.skipRest}
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink">
          <div
            className="h-full rounded-full bg-lime"
            style={{ width: `${(remaining / REST_MS) * 100}%` }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
