export type Role = "admin" | "user";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  created_at: string;
};

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  description: string | null;
  image_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type Workout = {
  id: string;
  user_id: string;
  performed_at: string;
  note: string | null;
  created_at: string;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  created_at: string;
};

export function asStringRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return asStringRecord(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function asProfile(value: unknown): Profile | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const email = asString(row.email);
  const role = row.role === "admin" || row.role === "user" ? row.role : null;
  const createdAt = asString(row.created_at);
  if (!id || !email || !role || !createdAt) return null;
  return {
    id,
    email,
    display_name: asString(row.display_name),
    role,
    created_at: createdAt,
  };
}

export function asExercise(value: unknown): Exercise | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name);
  const createdAt = asString(row.created_at);
  if (!id || !name || !createdAt) return null;
  return {
    id,
    name,
    muscle_group: asString(row.muscle_group),
    description: asString(row.description),
    image_path: asString(row.image_path),
    created_by: asString(row.created_by),
    created_at: createdAt,
  };
}

export function asWorkout(value: unknown): Workout | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const userId = asString(row.user_id);
  const performedAt = asString(row.performed_at);
  const createdAt = asString(row.created_at);
  if (!id || !userId || !performedAt || !createdAt) return null;
  return {
    id,
    user_id: userId,
    performed_at: performedAt,
    note: asString(row.note),
    created_at: createdAt,
  };
}

export function asSet(value: unknown): WorkoutSet | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const workoutId = asString(row.workout_id);
  const userId = asString(row.user_id);
  const exerciseId = asString(row.exercise_id);
  const setNumber = asNumber(row.set_number);
  const weight = asNumber(row.weight);
  const reps = asNumber(row.reps);
  const createdAt = asString(row.created_at);
  if (!id || !workoutId || !userId || !exerciseId || setNumber === null || weight === null || reps === null || !createdAt) {
    return null;
  }
  return {
    id,
    workout_id: workoutId,
    user_id: userId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight,
    reps,
    created_at: createdAt,
  };
}

export function asList<T>(value: unknown, map: (row: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const item = map(row);
    return item ? [item] : [];
  });
}
