import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fill, uk } from "../i18n/uk.ts";
import { formatDate } from "../lib/dates.ts";
import { supabase } from "../lib/supabase.ts";
import { asList, asStringRecord, asWorkout } from "../lib/types.ts";
import { IconChevron } from "../components/icons.tsx";
import { EmptyState, ErrorState, Loading, primaryButton, useTitle } from "../components/ui.tsx";

type HistoryItem = {
  id: string;
  performed_at: string;
  note: string | null;
  exerciseCount: number;
  setCount: number;
};

export function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  useTitle(uk.history.title);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("workouts")
      .select("id, user_id, performed_at, note, created_at, workout_sets(exercise_id)")
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPhase("error");
          return;
        }
        setItems(asList(data, (row) => {
          const workout = asWorkout(row);
          const record = asStringRecord(row);
          if (!workout || !record || !Array.isArray(record.workout_sets)) return workout ? { ...workout, exerciseCount: 0, setCount: 0 } : null;
          const ids = new Set(record.workout_sets.flatMap((set) => {
            const item = asStringRecord(set);
            return item && typeof item.exercise_id === "string" ? [item.exercise_id] : [];
          }));
          return {
            id: workout.id,
            performed_at: workout.performed_at,
            note: workout.note,
            exerciseCount: ids.size,
            setCount: record.workout_sets.length,
          };
        }));
        setPhase("ready");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  let lastDate = "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.history.title}</h1>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.history.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && items.length === 0 ? (
        <EmptyState
          title={uk.history.empty}
          text={uk.history.emptyHint}
          action={<Link to="/workout" className={`${primaryButton} w-auto px-5`}>{uk.history.start}</Link>}
        />
      ) : null}
      {phase === "ready" ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const showDate = item.performed_at !== lastDate;
            lastDate = item.performed_at;
            return (
              <li key={item.id}>
                {showDate ? <p className="mb-2 mt-3 text-sm text-muted">{formatDate(item.performed_at)}</p> : null}
                <Link to={`/workout/${item.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-panel px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="text-sm text-muted">
                      {fill(uk.workout.summary, { exercises: item.exerciseCount, sets: item.setCount })}
                    </span>
                    {item.note ? <span className="mt-1 block">{item.note}</span> : null}
                  </span>
                  <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
