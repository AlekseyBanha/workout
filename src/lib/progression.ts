import { roundToHalf } from "./numbers.ts";

export type SetSnapshot = {
  set_number: number;
  weight: number;
  reps: number;
};

export type HistorySet = SetSnapshot & {
  exercise_id: string;
  workout_id: string;
  performed_at: string;
  workout_created_at: string;
};

export type ProgressionSettings = {
  repMin: number;
  repMax: number;
  weightStep: number;
};

export const defaultProgression: ProgressionSettings = {
  repMin: 8,
  repMax: 12,
  weightStep: 2.5,
};

export type ProgressionSuggestion = {
  kind: "weight" | "reps";
  weight: number;
  reps: number;
  step: number;
};

export function epley1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export function previousSessionSets(rows: HistorySet[], exerciseId: string, current: {
  id: string;
  performed_at: string;
  created_at: string;
}): SetSnapshot[] {
  const candidates = rows.filter((row) => {
    if (row.exercise_id !== exerciseId || row.workout_id === current.id) return false;
    if (row.performed_at < current.performed_at) return true;
    if (row.performed_at > current.performed_at) return false;
    return row.workout_created_at < current.created_at;
  });
  if (candidates.length === 0) return [];

  const latest = [...candidates].sort((a, b) => {
    if (a.performed_at !== b.performed_at) return a.performed_at < b.performed_at ? 1 : -1;
    if (a.workout_created_at !== b.workout_created_at) return a.workout_created_at < b.workout_created_at ? 1 : -1;
    return a.set_number - b.set_number;
  })[0];

  return candidates
    .filter((row) => row.workout_id === latest.workout_id)
    .sort((a, b) => a.set_number - b.set_number)
    .map(({ set_number, weight, reps }) => ({ set_number, weight, reps }));
}

export function prefillForNextSet(previous: SetSnapshot[], nextSetNumber: number): { weight: number; reps: number } | null {
  if (previous.length === 0) return null;
  const sorted = [...previous].sort((a, b) => a.set_number - b.set_number);
  return sorted.find((set) => set.set_number === nextSetNumber) ?? sorted[sorted.length - 1] ?? null;
}

export function suggestProgression(
  previous: SetSnapshot[],
  nextSetNumber: number,
  settings: ProgressionSettings,
): ProgressionSuggestion | null {
  if (previous.length === 0) return null;
  const sorted = [...previous].sort((a, b) => a.set_number - b.set_number);
  const match = sorted.find((set) => set.set_number === nextSetNumber) ?? sorted[sorted.length - 1];
  if (!match) return null;

  if (previous.every((set) => set.reps >= settings.repMax)) {
    return {
      kind: "weight",
      weight: Math.min(999, roundToHalf(match.weight + settings.weightStep)),
      reps: match.reps,
      step: settings.weightStep,
    };
  }

  return {
    kind: "reps",
    weight: match.weight,
    reps: Math.min(100, match.reps + 1),
    step: 1,
  };
}

export type ProgressPoint = {
  date: string;
  label: string;
  maxWeight: number;
  oneRm: number;
};

export function buildProgressPoints(sets: Array<{ performed_at: string; weight: number; reps: number }>, labelFor: (iso: string) => string): ProgressPoint[] {
  const byDate = new Map<string, { maxWeight: number; oneRm: number }>();
  for (const set of sets) {
    const current = byDate.get(set.performed_at) ?? { maxWeight: 0, oneRm: 0 };
    current.maxWeight = Math.max(current.maxWeight, set.weight);
    current.oneRm = Math.max(current.oneRm, epley1rm(set.weight, set.reps));
    byDate.set(set.performed_at, current);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      label: labelFor(date),
      maxWeight: Math.round(value.maxWeight * 10) / 10,
      oneRm: Math.round(value.oneRm * 10) / 10,
    }));
}
