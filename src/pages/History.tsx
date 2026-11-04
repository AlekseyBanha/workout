import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { fill, uk } from "../i18n/uk.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate } from "../lib/dates.ts";
import { repeatWorkout } from "../lib/repeat-workout.ts";
import { supabase } from "../lib/supabase.ts";
import { asList, asStringRecord, asWorkout } from "../lib/types.ts";
import { IconChevron } from "../components/icons.tsx";
import { chipButton, EmptyState, ErrorState, Loading, primaryButton, useTitle } from "../components/ui.tsx";

type HistoryItem = {
  id: string;
  performed_at: string;
  note: string | null;
  heading: string | null;
  exerciseCount: number;
  setCount: number;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function exerciseName(value: unknown): string | null {
  const row = Array.isArray(value) ? asStringRecord(value[0]) : asStringRecord(value);
  if (!row || typeof row.name !== "string" || !row.name.trim()) return null;
  return row.name.trim();
}

function firstExerciseName(sets: unknown[]): string | null {
  const ordered = sets.flatMap((item) => {
    const set = asStringRecord(item);
    if (!set || typeof set.exercise_id !== "string") return [];
    return [{
      exerciseId: set.exercise_id,
      name: exerciseName(set.exercises) ?? "",
      createdAt: typeof set.created_at === "string" ? set.created_at : "",
      setNumber: finiteNumber(set.set_number) ?? 0,
    }];
  }).sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.setNumber - b.setNumber;
  });
  const seen = new Set<string>();
  for (const set of ordered) {
    if (seen.has(set.exerciseId)) continue;
    seen.add(set.exerciseId);
    if (set.name) return set.name;
  }
  return null;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  useTitle(uk.history.title);

  async function repeat(id: string) {
    if (!profile || repeatingId) return;
    setRepeatingId(id);
    setActionError("");
    const result = await repeatWorkout(profile.id, id);
    setRepeatingId(null);
    if (!result.ok) {
      setActionError(result.reason === "empty" ? uk.workout.noSets : uk.workout.saveError);
      return;
    }
    navigate(`/workout/${result.id}`);
  }

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("workouts")
      .select("id, user_id, performed_at, title, note, created_at, workout_sets(exercise_id, set_number, created_at, exercises(name))")
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
          const sets = record && Array.isArray(record.workout_sets) ? record.workout_sets : null;
          if (!workout || !sets) {
            return workout
              ? {
                id: workout.id,
                performed_at: workout.performed_at,
                note: workout.note,
                heading: workout.title?.trim() || null,
                exerciseCount: 0,
                setCount: 0,
              }
              : null;
          }
          const ids = new Set(sets.flatMap((set) => {
            const item = asStringRecord(set);
            return item && typeof item.exercise_id === "string" ? [item.exercise_id] : [];
          }));
          return {
            id: workout.id,
            performed_at: workout.performed_at,
            note: workout.note,
            heading: workout.title?.trim() || firstExerciseName(sets),
            exerciseCount: ids.size,
            setCount: sets.length,
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
      {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
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
                <div className="flex items-center gap-2 rounded-3xl border border-line bg-panel px-4 py-3">
                  <Link to={`/workout/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="min-w-0 flex-1">
                      {item.heading ? <span className="block font-medium">{item.heading}</span> : null}
                      <span className={item.heading ? "mt-1 block text-sm text-muted" : "text-sm text-muted"}>
                        {fill(uk.workout.summary, { exercises: item.exerciseCount, sets: item.setCount })}
                      </span>
                      {item.note ? <span className="mt-1 block">{item.note}</span> : null}
                    </span>
                    <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                  </Link>
                  <button
                    type="button"
                    className={`${chipButton} shrink-0`}
                    disabled={repeatingId !== null || !profile || item.setCount === 0}
                    onClick={() => void repeat(item.id)}
                  >
                    {repeatingId === item.id ? uk.workout.repeating : uk.workout.repeatOne}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
