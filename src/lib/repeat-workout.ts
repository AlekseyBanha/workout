import { todayISO } from "./dates.ts";
import { supabase } from "./supabase.ts";
import { asStringRecord } from "./types.ts";

type CopySet = {
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  created_at: string;
};

export type RepeatResult =
  | { ok: true; id: string }
  | { ok: false; reason: "config" | "save" | "empty" | "missing" };

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asCopySet(value: unknown): CopySet | null {
  const row = asStringRecord(value);
  if (!row || typeof row.exercise_id !== "string") return null;
  const setNumber = finiteNumber(row.set_number);
  const weight = finiteNumber(row.weight);
  const reps = finiteNumber(row.reps);
  if (setNumber === null || weight === null || reps === null) return null;
  if (!Number.isInteger(setNumber) || setNumber <= 0 || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return null;
  return {
    exercise_id: row.exercise_id,
    set_number: setNumber,
    weight,
    reps,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

function groupCopiedSets(sets: CopySet[]): CopySet[][] {
  const sorted = [...sets].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.set_number - b.set_number;
  });
  const order: string[] = [];
  const grouped = new Map<string, CopySet[]>();
  for (const set of sorted) {
    const list = grouped.get(set.exercise_id);
    if (list) list.push(set);
    else {
      order.push(set.exercise_id);
      grouped.set(set.exercise_id, [set]);
    }
  }
  return order.map((id) => (grouped.get(id) ?? []).sort((a, b) => a.set_number - b.set_number));
}

async function copySets(userId: string, title: string | null, sets: CopySet[]): Promise<RepeatResult> {
  if (!supabase) return { ok: false, reason: "config" };
  if (sets.length === 0) return { ok: false, reason: "empty" };
  const created = await supabase
    .from("workouts")
    .insert({ user_id: userId, performed_at: todayISO(), title })
    .select("id")
    .single();
  const createdRow = asStringRecord(created.data);
  if (created.error || !createdRow || typeof createdRow.id !== "string") return { ok: false, reason: "save" };

  for (const group of groupCopiedSets(sets)) {
    const inserted = await supabase.from("workout_sets").insert(group.map((set) => ({
      workout_id: createdRow.id,
      user_id: userId,
      exercise_id: set.exercise_id,
      set_number: set.set_number,
      weight: set.weight,
      reps: set.reps,
    })));
    if (inserted.error) {
      await supabase.from("workouts").delete().eq("id", createdRow.id);
      return { ok: false, reason: "save" };
    }
  }
  return { ok: true, id: createdRow.id };
}

function titleFrom(row: Record<string, unknown> | null): string | null {
  return row && typeof row.title === "string" && row.title.trim() ? row.title.trim() : null;
}

function setsFrom(row: Record<string, unknown> | null): CopySet[] {
  if (!row || !Array.isArray(row.workout_sets)) return [];
  return row.workout_sets.flatMap((item) => {
    const set = asCopySet(item);
    return set ? [set] : [];
  });
}

export async function repeatWorkout(userId: string, sourceId: string): Promise<RepeatResult> {
  if (!supabase) return { ok: false, reason: "config" };
  const source = await supabase
    .from("workouts")
    .select("id, title, workout_sets(exercise_id, set_number, weight, reps, created_at)")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (source.error) return { ok: false, reason: "save" };
  const row = asStringRecord(source.data);
  if (!row) return { ok: false, reason: "missing" };
  return copySets(userId, titleFrom(row), setsFrom(row));
}

export async function repeatLatestWorkout(userId: string): Promise<RepeatResult> {
  if (!supabase) return { ok: false, reason: "config" };
  const source = await supabase
    .from("workouts")
    .select("id, title, workout_sets!inner(exercise_id, set_number, weight, reps, created_at)")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (source.error) return { ok: false, reason: "save" };
  const row = asStringRecord(Array.isArray(source.data) ? source.data[0] : null);
  if (!row) return { ok: false, reason: "missing" };
  return copySets(userId, titleFrom(row), setsFrom(row));
}
