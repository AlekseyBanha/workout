import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { uk } from "../i18n/uk.ts";
import { formatChartDate, formatDate } from "../lib/dates.ts";
import { formatWeight } from "../lib/numbers.ts";
import { buildProgressPoints } from "../lib/progression.ts";
import { exerciseImageUrl, supabase } from "../lib/supabase.ts";
import { asExercise, asStringRecord } from "../lib/types.ts";
import { ErrorState, ExerciseThumb, Loading, useTitle } from "../components/ui.tsx";

const ProgressChart = lazy(() => import("../components/ProgressChart.tsx"));

type HistoryRow = {
  id: string;
  workoutId: string;
  performedAt: string;
  createdAt: string;
  setNumber: number;
  weight: number;
  reps: number;
};

function parseRows(value: unknown): HistoryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row, index) => {
    const record = asStringRecord(row);
    if (!record) return [];
    const workoutId = typeof record.workout_id === "string" ? record.workout_id : null;
    const weight = Number(record.weight);
    const reps = Number(record.reps);
    const setNumber = Number(record.set_number);
    const embedded = Array.isArray(record.workouts) ? record.workouts[0] : record.workouts;
    const workout = asStringRecord(embedded);
    const performedAt = workout && typeof workout.performed_at === "string" ? workout.performed_at : null;
    const createdAt = workout && typeof workout.created_at === "string" ? workout.created_at : null;
    if (!workoutId || !performedAt || !createdAt || !Number.isFinite(weight) || !Number.isFinite(reps) || !Number.isFinite(setNumber)) {
      return [];
    }
    return [{
      id: typeof record.id === "string" ? record.id : `${workoutId}-${index}`,
      workoutId,
      performedAt,
      createdAt,
      setNumber,
      weight,
      reps,
    }];
  });
}

export function ExerciseDetailPage() {
  const { id = "" } = useParams();
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "missing" | "ready">("loading");
  const [reload, setReload] = useState(0);
  useTitle(name || uk.exercises.title);

  useEffect(() => {
    if (!supabase || !id) return;
    let active = true;
    setPhase("loading");
    Promise.all([
      supabase.from("exercises").select("id, name, muscle_group, description, image_path, created_by, created_at").eq("id", id).maybeSingle(),
      supabase
        .from("workout_sets")
        .select("id, weight, reps, set_number, workout_id, workouts!inner(performed_at, created_at)")
        .eq("exercise_id", id),
    ]).then(([exerciseRes, setsRes]) => {
      if (!active) return;
      if (exerciseRes.error || setsRes.error) {
        setPhase("error");
        return;
      }
      const exercise = asExercise(exerciseRes.data);
      if (!exercise) {
        setPhase("missing");
        return;
      }
      setName(exercise.name);
      setMuscle(exercise.muscle_group);
      setDescription(exercise.description);
      setImage(exerciseImageUrl(exercise.image_path));
      setRows(parseRows(setsRes.data));
      setPhase("ready");
    });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const groups = [...rows]
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt) || b.createdAt.localeCompare(a.createdAt) || a.setNumber - b.setNumber)
    .reduce<Array<{ key: string; label: string; sets: HistoryRow[] }>>((list, row) => {
      const key = `${row.performedAt}:${row.workoutId}`;
      const group = list.find((item) => item.key === key);
      if (group) group.sets.push(row);
      else list.push({ key, label: formatDate(row.performedAt), sets: [row] });
      return list;
    }, []);

  const points = buildProgressPoints(
    rows.map((row) => ({ performed_at: row.performedAt, weight: row.weight, reps: row.reps })),
    formatChartDate,
  );
  const minWeight = rows.reduce((min, row) => Math.min(min, row.weight), Number.POSITIVE_INFINITY);
  const maxWeight = rows.reduce((max, row) => Math.max(max, row.weight), 0);

  if (phase === "loading") return <Loading />;
  if (phase === "error") return <ErrorState message={uk.detail.error} onRetry={() => setReload((value) => value + 1)} />;
  if (phase === "missing") return <ErrorState message={uk.detail.notFound} />;

  return (
    <div className="space-y-4">
      <Link to="/exercises" className="text-sm text-muted">{uk.back}</Link>
      <div className="overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="aspect-[4/3]">
          <ExerciseThumb src={image} alt={name} />
        </div>
        <div className="space-y-2 px-4 py-4">
          <h1 className="text-2xl font-semibold">{name}</h1>
          {muscle ? <p className="text-sm text-muted">{muscle}</p> : null}
          <p className="whitespace-pre-wrap text-sm">{description?.trim() || uk.detail.descriptionEmpty}</p>
        </div>
      </div>
      <section className="rounded-3xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">{uk.detail.chart}</h2>
        {points.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{uk.detail.empty}</p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-ink px-3 py-3">
                <dt className="text-xs text-muted">{uk.detail.minWeight}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{formatWeight(minWeight)} {uk.kg}</dd>
              </div>
              <div className="rounded-2xl bg-ink px-3 py-3">
                <dt className="text-xs text-muted">{uk.detail.maxWeight}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{formatWeight(maxWeight)} {uk.kg}</dd>
              </div>
            </dl>
            <Suspense fallback={<Loading />}>
              <ProgressChart points={points} />
            </Suspense>
          </>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{uk.detail.history}</h2>
        {groups.length === 0 ? <p className="text-sm text-muted">{uk.detail.empty}</p> : null}
        {groups.map((group) => (
          <article key={group.key} className="rounded-3xl border border-line bg-panel p-4">
            <h3 className="font-medium">{group.label}</h3>
            <ul className="mt-2 space-y-1">
              {group.sets
                .sort((a, b) => a.setNumber - b.setNumber)
                .map((set) => (
                  <li key={set.id} className="flex justify-between text-sm tabular-nums">
                    <span className="text-muted">{set.setNumber}</span>
                    <span>{formatWeight(set.weight)} {uk.kg} × {set.reps}</span>
                  </li>
                ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
