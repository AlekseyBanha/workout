import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fill, uk } from "../../i18n/uk.ts";
import { useAuth } from "../../lib/auth.tsx";
import { addDays, formatDate, isISODate, previousMonthRange, startOfMonth, todayISO } from "../../lib/dates.ts";
import { supabase } from "../../lib/supabase.ts";
import { asList, asStringRecord } from "../../lib/types.ts";
import { IconChevron } from "../icons.tsx";
import { cx, EmptyState, ErrorState, fieldClass, Loading, primaryButton, secondaryButton, useTitle } from "../ui.tsx";

const RANGE_KEY = "workout-range";
const PRESET_KEYS = ["month", "last", "d7", "d30"] as const;

type PresetKey = (typeof PRESET_KEYS)[number];

type StoredRange = {
  from: string;
  to: string;
  preset: PresetKey | null;
};

type ListedWorkout = {
  id: string;
  performed_at: string;
  created_at: string;
  title: string | null;
  exercises: string[];
  setCount: number;
};

type CopySet = {
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  created_at: string;
};

function isPresetKey(value: unknown): value is PresetKey {
  return value === "month" || value === "last" || value === "d7" || value === "d30";
}

function rangeFor(key: PresetKey, today: string): { from: string; to: string } {
  if (key === "month") return { from: startOfMonth(today), to: today };
  if (key === "last") return previousMonthRange(today);
  if (key === "d7") return { from: addDays(today, -6), to: today };
  return { from: addDays(today, -29), to: today };
}

function readStored(): StoredRange | null {
  try {
    const raw = sessionStorage.getItem(RANGE_KEY);
    if (!raw) return null;
    const record = asStringRecord(JSON.parse(raw) as unknown);
    const from = record && typeof record.from === "string" ? record.from : null;
    const to = record && typeof record.to === "string" ? record.to : null;
    if (!isISODate(from) || !isISODate(to)) return null;
    return {
      from,
      to,
      preset: isPresetKey(record?.preset) ? record.preset : null,
    };
  } catch {
    return null;
  }
}

function writeStored(range: StoredRange) {
  try {
    sessionStorage.setItem(RANGE_KEY, JSON.stringify(range));
  } catch {
    // Private mode or a full quota should not block the filter.
  }
}

function resolveRange(params: URLSearchParams): { from: string; to: string; preset: PresetKey | null } {
  const today = todayISO();
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const stored = readStored();

  if (isISODate(rawFrom) && isISODate(rawTo)) {
    const to = rawTo > today ? today : rawTo;
    const preset = stored && stored.from === rawFrom && stored.to === to ? stored.preset : null;
    return { from: rawFrom, to, preset };
  }

  if (stored?.preset) {
    return { ...rangeFor(stored.preset, today), preset: stored.preset };
  }

  const from = stored && isISODate(stored.from) ? stored.from : startOfMonth(today);
  let to = stored && isISODate(stored.to) ? stored.to : today;
  if (to > today) to = today;
  return { from, to, preset: null };
}

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

function listedWorkout(value: unknown): ListedWorkout | null {
  const row = asStringRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.performed_at !== "string") return null;
  const sets = Array.isArray(row.workout_sets) ? row.workout_sets : [];
  const ordered = sets.flatMap((item) => {
    const set = asStringRecord(item);
    if (!set || typeof set.exercise_id !== "string") return [];
    const setNumber = finiteNumber(set.set_number) ?? 0;
    return [{
      exerciseId: set.exercise_id,
      name: exerciseName(set.exercises) ?? "",
      createdAt: typeof set.created_at === "string" ? set.created_at : "",
      setNumber,
    }];
  }).sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.setNumber - b.setNumber;
  });
  const exercises: string[] = [];
  const seen = new Set<string>();
  for (const set of ordered) {
    if (seen.has(set.exerciseId)) continue;
    seen.add(set.exerciseId);
    if (set.name) exercises.push(set.name);
  }
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : null;
  return {
    id: row.id,
    performed_at: row.performed_at,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    title,
    exercises,
    setCount: sets.length,
  };
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

function activePreset(presets: Array<{ key: PresetKey; from: string; to: string }>, from: string, to: string, preferred: PresetKey | null): PresetKey | null {
  const matches = presets.filter((item) => item.from === from && item.to === to);
  if (preferred && matches.some((item) => item.key === preferred)) return preferred;
  return matches[0]?.key ?? null;
}

export function WorkoutHome() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const resolved = resolveRange(params);
  const { from, to } = resolved;
  const [preferred, setPreferred] = useState<PresetKey | null>(resolved.preset);
  const synced = useRef(false);
  const [items, setItems] = useState<ListedWorkout[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [todayId, setTodayId] = useState<string | null>(null);
  const [todayReady, setTodayReady] = useState(false);
  const [pending, setPending] = useState<"start" | "repeat" | null>(null);
  const [actionError, setActionError] = useState("");
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const userId = profile?.id;
  const rangeInvalid = from > to;
  const today = todayISO();
  const presets = PRESET_KEYS.map((key) => ({
    key,
    label: {
      month: uk.workout.thisMonth,
      last: uk.workout.lastMonth,
      d7: uk.workout.days7,
      d30: uk.workout.days30,
    }[key],
    ...rangeFor(key, today),
  }));
  const active = activePreset(presets, from, to, preferred);
  useTitle(uk.workout.title);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    writeStored({ from, to, preset: preferred ?? active });
    if (params.get("from") === from && params.get("to") === to) return;
    setParams({ from, to }, { replace: true });
  }, [active, from, to, preferred, params, setParams]);

  useEffect(() => {
    if (!supabase || !userId) return;
    let activeRequest = true;
    setTodayReady(false);
    supabase
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .eq("performed_at", todayISO())
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!activeRequest) return;
        const row = asStringRecord(Array.isArray(data) ? data[0] : null);
        setTodayId(!error && row && typeof row.id === "string" ? row.id : null);
        setTodayReady(true);
      });
    return () => {
      activeRequest = false;
    };
  }, [userId, reload]);

  useEffect(() => {
    if (!supabase || !userId) return;
    if (from > to) {
      setItems([]);
      setPhase("ready");
      return;
    }
    let activeRequest = true;
    setPhase("loading");
    supabase
      .from("workouts")
      .select("id, performed_at, title, created_at, workout_sets(exercise_id, set_number, created_at, exercises(name))")
      .eq("user_id", userId)
      .gte("performed_at", from)
      .lte("performed_at", to)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!activeRequest) return;
        if (error) {
          setPhase("error");
          return;
        }
        setItems(asList(data, listedWorkout).sort((a, b) => {
          if (a.performed_at !== b.performed_at) return a.performed_at < b.performed_at ? 1 : -1;
          return a.created_at < b.created_at ? 1 : -1;
        }));
        setPhase("ready");
      });
    return () => {
      activeRequest = false;
    };
  }, [userId, from, to, reload]);

  function commit(nextFrom: string, nextTo: string, preset: PresetKey | null) {
    if (!isISODate(nextFrom) || !isISODate(nextTo)) return;
    const nextToClamped = nextTo > todayISO() ? todayISO() : nextTo;
    setPreferred(preset);
    writeStored({ from: nextFrom, to: nextToClamped, preset });
    setParams({ from: nextFrom, to: nextToClamped }, { replace: true });
  }

  async function startOrContinue() {
    if (lock.current || !supabase || !profile) return;
    lock.current = true;
    setPending("start");
    setActionError("");
    const todayDate = todayISO();
    const existing = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", profile.id)
      .eq("performed_at", todayDate)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing.error) {
      lock.current = false;
      setPending(null);
      setActionError(uk.workout.saveError);
      return;
    }
    const existingRow = asStringRecord(Array.isArray(existing.data) ? existing.data[0] : null);
    if (existingRow && typeof existingRow.id === "string") {
      lock.current = false;
      setPending(null);
      navigate(`/workout/${existingRow.id}`);
      return;
    }
    const created = await supabase
      .from("workouts")
      .insert({ user_id: profile.id, performed_at: todayDate })
      .select("id")
      .single();
    lock.current = false;
    setPending(null);
    const createdRow = asStringRecord(created.data);
    if (created.error || !createdRow || typeof createdRow.id !== "string") {
      setActionError(uk.workout.saveError);
      return;
    }
    navigate(`/workout/${createdRow.id}`);
  }

  async function repeatLast() {
    if (lock.current || !supabase || !profile) return;
    lock.current = true;
    setPending("repeat");
    setActionError("");
    const source = await supabase
      .from("workouts")
      .select("id, title, workout_sets!inner(exercise_id, set_number, weight, reps, created_at)")
      .eq("user_id", profile.id)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const sourceRow = asStringRecord(Array.isArray(source.data) ? source.data[0] : null);
    const copied = sourceRow && Array.isArray(sourceRow.workout_sets) ? sourceRow.workout_sets.flatMap((item) => {
      const set = asCopySet(item);
      return set ? [set] : [];
    }) : [];
    if (source.error) {
      lock.current = false;
      setPending(null);
      setActionError(uk.workout.saveError);
      return;
    }
    if (!sourceRow || copied.length === 0) {
      lock.current = false;
      setPending(null);
      setActionError(uk.workout.noPrevious);
      return;
    }
    const title = typeof sourceRow.title === "string" && sourceRow.title.trim() ? sourceRow.title.trim() : null;
    const created = await supabase
      .from("workouts")
      .insert({ user_id: profile.id, performed_at: todayISO(), title })
      .select("id")
      .single();
    const createdRow = asStringRecord(created.data);
    if (created.error || !createdRow || typeof createdRow.id !== "string") {
      lock.current = false;
      setPending(null);
      setActionError(uk.workout.saveError);
      return;
    }
    const groups = groupCopiedSets(copied);
    for (const group of groups) {
      const inserted = await supabase.from("workout_sets").insert(group.map((set) => ({
        workout_id: createdRow.id,
        user_id: profile.id,
        exercise_id: set.exercise_id,
        set_number: set.set_number,
        weight: set.weight,
        reps: set.reps,
      })));
      if (inserted.error) {
        await supabase.from("workouts").delete().eq("id", createdRow.id);
        lock.current = false;
        setPending(null);
        setActionError(uk.workout.saveError);
        return;
      }
    }
    lock.current = false;
    setPending(null);
    navigate(`/workout/${createdRow.id}`);
  }

  const startLabel = todayId
    ? uk.workout.continue
    : pending === "start"
      ? uk.workout.starting
      : uk.workout.start;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.workout.title}</h1>
      <div className="space-y-2">
        <button
          type="button"
          className={primaryButton}
          disabled={pending !== null || !profile || !todayReady}
          onClick={() => void startOrContinue()}
        >
          {startLabel}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={pending !== null || !profile}
          onClick={() => void repeatLast()}
        >
          {pending === "repeat" ? uk.workout.repeating : uk.workout.repeat}
        </button>
      </div>
      {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-sm text-muted">{uk.workout.from}</span>
          <input
            className={`${fieldClass} min-w-0`}
            type="date"
            value={from}
            onChange={(event) => commit(event.target.value, to, null)}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-sm text-muted">{uk.workout.to}</span>
          <input
            className={`${fieldClass} min-w-0`}
            type="date"
            value={to}
            max={today}
            onChange={(event) => commit(from, event.target.value, null)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const selected = active === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={selected}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                selected ? "bg-lime text-ink" : "border border-line bg-panel text-white",
              )}
              onClick={() => commit(preset.from, preset.to, preset.key)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {rangeInvalid ? <p className="text-sm text-danger" role="alert">{uk.workout.rangeOrder}</p> : null}
      {!rangeInvalid && phase === "loading" ? <Loading /> : null}
      {!rangeInvalid && phase === "error" ? <ErrorState message={uk.workout.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {!rangeInvalid && phase === "ready" && items.length === 0 ? <EmptyState title={uk.workout.emptyPeriod} /> : null}
      {!rangeInvalid && phase === "ready" && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-3xl border border-line bg-panel px-4 py-3 text-left"
                onClick={() => navigate(`/workout/${item.id}`)}
              >
                <span className="min-w-0 flex-1">
                  <span className={cx("block", item.title ? "text-sm text-muted" : "font-medium")}>
                    {formatDate(item.performed_at)}
                  </span>
                  {item.title ? <span className="mt-0.5 block font-medium">{item.title}</span> : null}
                  {item.exercises.length > 0 ? <span className="mt-1 block text-sm">{item.exercises.join(", ")}</span> : null}
                  <span className="mt-1 block text-sm text-muted">{fill(uk.workout.setsCount, { sets: item.setCount })}</span>
                </span>
                <IconChevron className="h-5 w-5 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
