import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fill, uk } from "../../i18n/uk.ts";
import { useAuth } from "../../lib/auth.tsx";
import { formatDate, formatTime, todayISO } from "../../lib/dates.ts";
import { supabase } from "../../lib/supabase.ts";
import { asList, asStringRecord, asWorkout } from "../../lib/types.ts";
import { EmptyState, ErrorState, fieldClass, Loading, primaryButton, useTitle } from "../ui.tsx";

type DayWorkout = {
  id: string;
  performed_at: string;
  note: string | null;
  created_at: string;
  exerciseCount: number;
  setCount: number;
};

function summarize(value: unknown): { exerciseCount: number; setCount: number } {
  if (!Array.isArray(value)) return { exerciseCount: 0, setCount: 0 };
  const ids = new Set<string>();
  for (const row of value) {
    if (row && typeof row === "object" && "exercise_id" in row && typeof row.exercise_id === "string") {
      ids.add(row.exercise_id);
    }
  }
  return { exerciseCount: ids.size, setCount: value.length };
}

export function WorkoutHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [date, setDate] = useState(todayISO);
  const [items, setItems] = useState<DayWorkout[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useTitle(uk.workout.title);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("workouts")
      .select("id, user_id, performed_at, note, created_at, workout_sets(exercise_id)")
      .eq("performed_at", date)
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setPhase("error");
          return;
        }
        setItems(asList(data, (row) => {
          const workout = asWorkout(row);
          if (!workout) return null;
          const record = asStringRecord(row);
          const counts = summarize(record?.workout_sets);
          return { ...workout, ...counts };
        }));
        setPhase("ready");
      });
    return () => {
      active = false;
    };
  }, [date, reload]);

  async function start() {
    if (!supabase || !profile) return;
    setBusy(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("workouts")
      .insert({ user_id: profile.id, performed_at: date })
      .select("id, user_id, performed_at, note, created_at")
      .single();
    setBusy(false);
    const created = asWorkout(data);
    if (insertError || !created) {
      setError(uk.workout.saveError);
      return;
    }
    navigate(`/workout/${created.id}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.workout.title}</h1>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{uk.workout.date}</span>
        <input className={fieldClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.workout.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && items.length === 0 ? (
        <EmptyState title={uk.workout.emptyDay} text={uk.workout.emptyDayHint} />
      ) : null}
      {phase === "ready" ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-3xl border border-line bg-panel px-4 py-3 text-left"
                onClick={() => navigate(`/workout/${item.id}`)}
              >
                <span className="block font-medium">{formatDate(item.performed_at)} · {formatTime(item.created_at)}</span>
                <span className="mt-1 block text-sm text-muted">
                  {fill(uk.workout.summary, { exercises: item.exerciseCount, sets: item.setCount })}
                </span>
                {item.note ? <span className="mt-1 block text-sm">{item.note}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="button" className={primaryButton} disabled={busy || !profile} onClick={() => void start()}>
        {busy ? uk.workout.starting : uk.workout.start}
      </button>
    </div>
  );
}
