import { addDays, formatChartDate, formatISODate } from "./dates.ts";
import { epley1rm } from "./progression.ts";

export type ProgressPeriod = "4w" | "12w" | "all";

export type ProgressSet = {
  exerciseId: string;
  name: string;
  muscle: string | null;
  workoutId: string;
  performedAt: string;
  workoutCreatedAt: string;
  weight: number;
  reps: number;
};

export type PeriodRange = {
  from: string;
  to: string;
  previous: { from: string; to: string } | null;
};

export type LoadSummary = {
  workouts: number;
  sets: number;
  tonnage: number;
};

export type TonnagePoint = {
  week: string;
  label: string;
  tonnage: number;
};

export type ExerciseProgress = {
  exerciseId: string;
  name: string;
  muscle: string | null;
  lastPerformedAt: string;
  lastCreatedAt: string;
  weight: number;
  reps: number;
  delta: number | null;
  chart: number[];
  trend: "up" | "flat" | "down";
};

const periodDays: Record<Exclude<ProgressPeriod, "all">, number> = {
  "4w": 28,
  "12w": 84,
};

export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function mondayOf(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const shift = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - shift);
  return formatISODate(date);
}

export function periodRange(period: ProgressPeriod, today: string, sets: ProgressSet[]): PeriodRange {
  if (period === "all") {
    const dates = sets.map((set) => set.performedAt).sort();
    const first = dates[0] ?? today;
    const last = dates[dates.length - 1] ?? today;
    return {
      from: first < today ? first : today,
      to: last > today ? last : today,
      previous: null,
    };
  }
  const days = periodDays[period];
  const from = addDays(today, -(days - 1));
  const previousTo = addDays(from, -1);
  return {
    from,
    to: today,
    previous: { from: addDays(previousTo, -(days - 1)), to: previousTo },
  };
}

export function setsInRange(sets: ProgressSet[], from: string, to: string): ProgressSet[] {
  return sets.filter((set) => set.performedAt >= from && set.performedAt <= to);
}

function setTonnage(set: ProgressSet): number {
  if (set.weight <= 0 || set.reps <= 0) return 0;
  return set.weight * set.reps;
}

export function summarizeLoad(sets: ProgressSet[]): LoadSummary {
  const workouts = new Set<string>();
  let tonnage = 0;
  for (const set of sets) {
    workouts.add(set.workoutId);
    tonnage += setTonnage(set);
  }
  return { workouts: workouts.size, sets: sets.length, tonnage: roundTenth(tonnage) };
}

export function tonnageByWeek(sets: ProgressSet[], from: string, to: string): TonnagePoint[] {
  const start = mondayOf(from);
  const end = mondayOf(to);
  const buckets = new Map<string, number>();
  for (let week = start; week <= end; week = addDays(week, 7)) buckets.set(week, 0);
  for (const set of sets) {
    if (set.performedAt < from || set.performedAt > to) continue;
    const week = mondayOf(set.performedAt);
    buckets.set(week, (buckets.get(week) ?? 0) + setTonnage(set));
  }
  return [...buckets.entries()].map(([week, tonnage]) => ({
    week,
    label: formatChartDate(week),
    tonnage: roundTenth(tonnage),
  }));
}

function bestE1rm(sets: ProgressSet[]): number | null {
  let best = 0;
  let found = false;
  for (const set of sets) {
    if (set.weight <= 0 || set.reps <= 0) continue;
    found = true;
    best = Math.max(best, epley1rm(set.weight, set.reps));
  }
  return found ? roundTenth(best) : null;
}

function laterSession(a: ProgressSet, b: ProgressSet): ProgressSet {
  if (a.performedAt !== b.performedAt) return a.performedAt > b.performedAt ? a : b;
  if (a.workoutCreatedAt !== b.workoutCreatedAt) return a.workoutCreatedAt > b.workoutCreatedAt ? a : b;
  return a;
}

function sessionTrend(
  recent: { weight: number; reps: number } | undefined,
  before: { weight: number; reps: number } | undefined,
): "up" | "flat" | "down" {
  if (!recent || !before) return "flat";
  if (recent.weight !== before.weight) return recent.weight > before.weight ? "up" : "down";
  if (recent.reps !== before.reps) return recent.reps > before.reps ? "up" : "down";
  return "flat";
}

function heavierSet(a: ProgressSet, b: ProgressSet): ProgressSet {
  if (a.weight !== b.weight) return a.weight > b.weight ? a : b;
  if (a.reps !== b.reps) return a.reps > b.reps ? a : b;
  return a;
}

export function exerciseProgress(current: ProgressSet[], previous: ProgressSet[]): ExerciseProgress[] {
  const byExercise = new Map<string, ProgressSet[]>();
  for (const set of current) {
    const list = byExercise.get(set.exerciseId);
    if (list) list.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }
  const previousByExercise = new Map<string, ProgressSet[]>();
  for (const set of previous) {
    const list = previousByExercise.get(set.exerciseId);
    if (list) list.push(set);
    else previousByExercise.set(set.exerciseId, [set]);
  }

  const rows: ExerciseProgress[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const latest = sets.reduce(laterSession);
    const session = sets.filter((set) => set.workoutId === latest.workoutId);
    const best = session.reduce(heavierSet);
    const currentRm = bestE1rm(sets);
    const previousRm = bestE1rm(previousByExercise.get(exerciseId) ?? []);
    const sessions = new Map<string, ProgressSet[]>();
    for (const set of sets) {
      const list = sessions.get(set.workoutId);
      if (list) list.push(set);
      else sessions.set(set.workoutId, [set]);
    }
    const ordered = [...sessions.values()]
      .map((group) => {
        const when = group.reduce(laterSession);
        const best = group.reduce(heavierSet);
        return {
          performedAt: when.performedAt,
          createdAt: when.workoutCreatedAt,
          weight: best.weight,
          reps: best.reps,
        };
      })
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.createdAt.localeCompare(b.createdAt));
    const recent = ordered.at(-1);
    const before = ordered.at(-2);
    const trend = sessionTrend(recent, before);
    rows.push({
      exerciseId,
      name: best.name,
      muscle: best.muscle,
      lastPerformedAt: latest.performedAt,
      lastCreatedAt: latest.workoutCreatedAt,
      weight: best.weight,
      reps: best.reps,
      delta: currentRm !== null && previousRm !== null ? roundTenth(currentRm - previousRm) : null,
      chart: ordered.map((point) => point.weight),
      trend,
    });
  }

  const trendRank = { up: 0, flat: 1, down: 2 };
  rows.sort((a, b) => {
    if (a.trend !== b.trend) return trendRank[a.trend] - trendRank[b.trend];
    const aUp = a.delta !== null && a.delta > 0;
    const bUp = b.delta !== null && b.delta > 0;
    if (aUp !== bUp) return aUp ? -1 : 1;
    if (aUp && bUp && a.delta !== b.delta) return (b.delta ?? 0) - (a.delta ?? 0);
    if (a.lastPerformedAt !== b.lastPerformedAt) return a.lastPerformedAt < b.lastPerformedAt ? 1 : -1;
    if (a.lastCreatedAt !== b.lastCreatedAt) return a.lastCreatedAt < b.lastCreatedAt ? 1 : -1;
    return a.name.localeCompare(b.name, "uk");
  });
  return rows;
}
