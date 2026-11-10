import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { IconChevron } from "../components/icons.tsx";
import { cx, ErrorState, Loading, useTitle } from "../components/ui.tsx";
import { fill, muscleGroups, uk } from "../i18n/uk.ts";
import { todayISO } from "../lib/dates.ts";
import { formatWeight } from "../lib/numbers.ts";
import {
  exerciseProgress,
  periodRange,
  setsInRange,
  summarizeLoad,
  tonnageByWeek,
  type ProgressPeriod,
  type ProgressSet,
} from "../lib/progress.ts";
import { supabase } from "../lib/supabase.ts";
import { asStringRecord } from "../lib/types.ts";

const TonnageChart = lazy(() => import("../components/TonnageChart.tsx"));

const periods: Array<{ key: ProgressPeriod; label: string }> = [
  { key: "4w", label: uk.progress.weeks4 },
  { key: "12w", label: uk.progress.weeks12 },
  { key: "all", label: uk.progress.all },
];

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function embeddedRecord(value: unknown): Record<string, unknown> | null {
  return asStringRecord(Array.isArray(value) ? value[0] : value);
}

function parseSets(value: unknown): ProgressSet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const record = asStringRecord(row);
    if (!record) return [];
    const exerciseId = typeof record.exercise_id === "string" ? record.exercise_id : null;
    const workoutId = typeof record.workout_id === "string" ? record.workout_id : null;
    const weight = finiteNumber(record.weight);
    const reps = finiteNumber(record.reps);
    const exercise = embeddedRecord(record.exercises);
    const workout = embeddedRecord(record.workouts);
    const name = exercise && typeof exercise.name === "string" ? exercise.name.trim() : "";
    const muscle = exercise && typeof exercise.muscle_group === "string" && exercise.muscle_group.trim()
      ? exercise.muscle_group.trim()
      : null;
    const performedAt = workout && typeof workout.performed_at === "string" ? workout.performed_at : null;
    const workoutCreatedAt = workout && typeof workout.created_at === "string" ? workout.created_at : null;
    if (!exerciseId || !workoutId || !name || !performedAt || !workoutCreatedAt || weight === null || reps === null) return [];
    return [{ exerciseId, name, muscle, workoutId, performedAt, workoutCreatedAt, weight, reps }];
  });
}

async function loadSets(muscle: string): Promise<ProgressSet[]> {
  if (!supabase) return [];
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("workout_sets")
      .select("id, weight, reps, exercise_id, workout_id, exercises!inner(name, muscle_group), workouts!inner(performed_at, created_at)")
      .eq("exercises.muscle_group", muscle)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return parseSets(rows);
}

function Sparkline({ values, trend }: { values: number[]; trend: "up" | "flat" | "down" }) {
  const width = 76;
  const height = 32;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const color = trend === "up" ? "#d6ff4a" : trend === "flat" ? "#ffc14a" : "#ff5d73";
  const label = trend === "up" ? uk.progress.trendUp : trend === "flat" ? uk.progress.trendFlat : uk.progress.trendDown;
  const last = coords[coords.length - 1];
  const path = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      role="img"
      aria-label={label}
    >
      {coords.length > 1 ? (
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {last ? <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} /> : null}
    </svg>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

function formatTonnage(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
}

function formatSigned(value: number, formatted: string): string {
  if (value === 0) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function deltaClass(value: number): string {
  if (value > 0) return "text-lime";
  if (value < 0) return "text-danger";
  return "text-muted";
}

export function ProgressPage() {
  const [sets, setSets] = useState<ProgressSet[]>([]);
  const [period, setPeriod] = useState<ProgressPeriod>("4w");
  const [muscle, setMuscle] = useState<string>(muscleGroups[0]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  useTitle(uk.progress.title);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    loadSets(muscle)
      .then((rows) => {
        if (!active) return;
        setSets(rows);
        setPhase("ready");
      })
      .catch(() => {
        if (active) setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [muscle, reload]);

  const today = todayISO();
  const range = useMemo(() => periodRange(period, today, sets), [period, today, sets]);
  const currentSets = useMemo(() => setsInRange(sets, range.from, range.to), [sets, range]);
  const previousSets = useMemo(
    () => (range.previous ? setsInRange(sets, range.previous.from, range.previous.to) : []),
    [sets, range],
  );
  const load = useMemo(() => summarizeLoad(currentSets), [currentSets]);
  const previousLoad = useMemo(() => (range.previous ? summarizeLoad(previousSets) : null), [range, previousSets]);
  const points = useMemo(() => tonnageByWeek(currentSets, range.from, range.to), [currentSets, range]);
  const exercises = useMemo(() => exerciseProgress(currentSets, previousSets), [currentSets, previousSets]);
  const showChart = points.some((point) => point.tonnage > 0);
  const hasBodyweight = currentSets.some((set) => set.weight <= 0);

  const stats = [
    {
      label: uk.progress.workouts,
      value: formatCount(load.workouts),
      delta: previousLoad ? load.workouts - previousLoad.workouts : null,
      text: previousLoad ? formatSigned(load.workouts - previousLoad.workouts, formatCount(Math.abs(load.workouts - previousLoad.workouts))) : null,
    },
    {
      label: uk.progress.sets,
      value: formatCount(load.sets),
      delta: previousLoad ? load.sets - previousLoad.sets : null,
      text: previousLoad ? formatSigned(load.sets - previousLoad.sets, formatCount(Math.abs(load.sets - previousLoad.sets))) : null,
    },
    {
      label: uk.progress.tonnage,
      value: formatTonnage(load.tonnage),
      delta: previousLoad ? load.tonnage - previousLoad.tonnage : null,
      text: previousLoad
        ? formatSigned(load.tonnage - previousLoad.tonnage, `${formatTonnage(Math.abs(load.tonnage - previousLoad.tonnage))} ${uk.kg}`)
        : null,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.progress.title}</h1>
      <div className="flex flex-wrap gap-2">
        {periods.map((item) => {
          const selected = period === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                selected ? "bg-lime text-ink" : "border border-line bg-panel text-white",
              )}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {muscleGroups.map((group) => {
          const selected = muscle === group;
          return (
            <button
              key={group}
              type="button"
              aria-pressed={selected}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                selected ? "bg-lime text-ink" : "border border-line bg-panel text-white",
              )}
              onClick={() => setMuscle(group)}
            >
              {group}
            </button>
          );
        })}
      </div>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.progress.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" ? (
        <>
          <section className="rounded-3xl border border-line bg-panel p-4">
            <h2 className="text-lg font-semibold">{uk.progress.load}</h2>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-ink px-3 py-3">
                  <dt className="text-xs text-muted">{stat.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
                  {stat.text !== null && stat.delta !== null ? (
                    <dd className={cx("mt-1 text-xs font-medium tabular-nums", deltaClass(stat.delta))}>{stat.text}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
            {previousLoad ? (
              <p className="mt-3 text-xs text-muted">
                {period === "12w" ? uk.progress.compared12 : uk.progress.compared4}
              </p>
            ) : null}
            {hasBodyweight ? <p className="mt-2 text-xs text-muted">{uk.progress.bodyweight}</p> : null}
            {showChart ? (
              <div className="mt-3">
                <h3 className="text-sm text-muted">{uk.progress.chart}</h3>
                <Suspense fallback={<Loading />}>
                  <TonnageChart points={points} />
                </Suspense>
              </div>
            ) : null}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{uk.progress.strength}</h2>
            <p className="text-sm text-muted">{uk.progress.oneRmHint}</p>
            {exercises.length === 0 ? (
              <p className="text-sm text-muted">{sets.length === 0 ? uk.progress.noExercises : uk.progress.emptyPeriod}</p>
            ) : (
              <ul className="space-y-2">
                {exercises.map((row) => (
                  <li key={row.exerciseId}>
                    <Link to={`/exercises/${row.exerciseId}`} className="flex items-center gap-3 rounded-3xl border border-line bg-panel px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{row.name}</span>
                        <span className="mt-1 block text-sm text-muted tabular-nums">
                          {fill(uk.progress.lastSet, { weight: formatWeight(row.weight), reps: row.reps })}
                        </span>
                      </span>
                      {row.chart.length > 0 ? <Sparkline values={row.chart} trend={row.trend} /> : null}
                      {row.delta !== null ? (
                        <span className={cx("shrink-0 text-sm font-semibold tabular-nums", deltaClass(row.delta))}>
                          {formatSigned(row.delta, `${formatWeight(Math.abs(row.delta))} ${uk.kg}`)}
                        </span>
                      ) : null}
                      <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
