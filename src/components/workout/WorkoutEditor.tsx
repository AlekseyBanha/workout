import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { fill, uk } from "../../i18n/uk.ts";
import { useAuth } from "../../lib/auth.tsx";
import { isHalfStep } from "../../lib/numbers.ts";
import { previousSessionSets, type HistorySet, type ProgressionSettings } from "../../lib/progression.ts";
import { repeatWorkout } from "../../lib/repeat-workout.ts";
import { loadProgressionSettings, saveProgressionSettings } from "../../lib/settings.ts";
import { supabase } from "../../lib/supabase.ts";
import { asExercise, asList, asSet, asStringRecord, asWorkout, type Exercise, type Workout, type WorkoutSet } from "../../lib/types.ts";
import { BackButton, ConfirmDialog, dangerOutline, ErrorState, fieldClass, Loading, secondaryButton, useTitle } from "../ui.tsx";
import { ExerciseBlock } from "./ExerciseBlock.tsx";
import { ExercisePicker } from "./ExercisePicker.tsx";
import { cancelLockScreenArm } from "../../lib/lock-screen-rest.ts";
import { REST_MS, RestTimer } from "./RestTimer.tsx";

const PENDING_KEY = "workout-pending-exercises";

function mergeHistory(current: HistorySet[], incoming: HistorySet[], exerciseIds: string[]): HistorySet[] {
  const replace = new Set(exerciseIds);
  return [...current.filter((row) => !replace.has(row.exercise_id)), ...incoming];
}

function readPendingMap(): Record<string, string[]> {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string[]> = {};
    for (const [workoutId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((item): item is string => typeof item === "string" && item.length > 0);
      if (ids.length) result[workoutId] = ids;
    }
    return result;
  } catch {
    return {};
  }
}

function readPending(workoutId: string): string[] {
  return readPendingMap()[workoutId] ?? [];
}

function writePending(workoutId: string, ids: string[]) {
  try {
    const map = readPendingMap();
    if (ids.length) map[workoutId] = ids;
    else delete map[workoutId];
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(map));
  } catch {
    // Private mode or a full quota should not block the workout.
  }
}

function mergePending(current: Exercise[], storedIds: string[], catalogList: Exercise[]): Exercise[] {
  const byId = new Map<string, Exercise>();
  for (const exercise of [...catalogList, ...current]) byId.set(exercise.id, exercise);
  const next: Exercise[] = [];
  const seen = new Set<string>();
  for (const exerciseId of storedIds) {
    const exercise = byId.get(exerciseId);
    if (!exercise || seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    next.push(exercise);
  }
  for (const exercise of current) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    next.push(exercise);
  }
  if (next.length === current.length && next.every((exercise, index) => exercise.id === current[index]?.id)) return current;
  return next;
}

function useAutosaveWorkoutField(
  id: string,
  column: "title" | "note",
  value: string,
  phase: string,
  onError: () => void,
) {
  const ready = useRef(false);
  const pending = useRef<{ value: string | null } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (phase !== "ready" || !supabase) return;
    if (!ready.current) {
      ready.current = true;
      return;
    }
    const client = supabase;
    const next = value.trim() || null;
    pending.current = { value: next };
    const timer = window.setTimeout(() => {
      pending.current = null;
      void client.from("workouts").update({ [column]: next }).eq("id", id).select("id").then(({ data, error }) => {
        if (error || !data?.length) onErrorRef.current();
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [column, id, phase, value]);

  useEffect(() => {
    const workoutId = id;
    const field = column;
    return () => {
      const next = pending.current;
      if (!next || !supabase) return;
      pending.current = null;
      void supabase.from("workouts").update({ [field]: next.value }).eq("id", workoutId).select("id").then(({ data, error }) => {
        if (error || !data?.length) onErrorRef.current();
      });
    };
  }, [column, id]);
}

function parseHistory(value: unknown): HistorySet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const record = asStringRecord(row);
    if (!record) return [];
    const exerciseId = typeof record.exercise_id === "string" ? record.exercise_id : null;
    const workoutId = typeof record.workout_id === "string" ? record.workout_id : null;
    const weight = Number(record.weight);
    const reps = Number(record.reps);
    const setNumber = Number(record.set_number);
    const embedded = Array.isArray(record.workouts) ? record.workouts[0] : record.workouts;
    const workout = asStringRecord(embedded);
    const performed = workout && typeof workout.performed_at === "string" ? workout.performed_at : null;
    const created = workout && typeof workout.created_at === "string" ? workout.created_at : null;
    if (!exerciseId || !workoutId || !performed || !created || !Number.isFinite(weight) || !Number.isFinite(reps) || !Number.isFinite(setNumber)) {
      return [];
    }
    return [{
      exercise_id: exerciseId,
      workout_id: workoutId,
      performed_at: performed,
      workout_created_at: created,
      weight,
      reps,
      set_number: setNumber,
    }];
  });
}

export function WorkoutEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<HistorySet[]>([]);
  const [pending, setPending] = useState<Exercise[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"loading" | "error" | "missing" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Exercise | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settings, setSettings] = useState<ProgressionSettings>(loadProgressionSettings);
  const [settingsError, setSettingsError] = useState("");
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [writes, setWrites] = useState(0);
  const setsRef = useRef<WorkoutSet[]>([]);
  const pendingRef = useRef<Exercise[]>([]);
  const removedRef = useRef(new Set<string>());
  const tailsRef = useRef(new Map<string, Promise<unknown>>());
  const numbersRef = useRef(new Map<string, number>());
  const restGen = useRef(0);
  useTitle(uk.workout.title);
  useAutosaveWorkoutField(id, "title", title, phase, () => setError(uk.workout.saveError));
  useAutosaveWorkoutField(id, "note", note, phase, () => setError(uk.workout.saveError));

  useEffect(() => {
    if (phase !== "ready") return;
    writePending(id, pending.map((exercise) => exercise.id));
  }, [id, pending, phase]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    if (reload === 0) setPhase("loading");

    async function load() {
      const client = supabase;
      if (!client) return;
      const workoutRes = await client.from("workouts").select("id, user_id, performed_at, title, note, created_at").eq("id", id).maybeSingle();
      if (!active) return;
      if (workoutRes.error) {
        setPhase("error");
        return;
      }
      const current = asWorkout(workoutRes.data);
      if (!current) {
        setPhase("missing");
        return;
      }

      const setsRes = await client
        .from("workout_sets")
        .select("id, workout_id, user_id, exercise_id, set_number, weight, reps, created_at")
        .eq("workout_id", id)
        .order("set_number");
      if (!active) return;
      if (setsRes.error) {
        setPhase("error");
        return;
      }

      const nextSets = asList(setsRes.data, asSet);
      const ids = [...new Set(nextSets.map((set) => set.exercise_id))];
      const [exerciseRes, historyRes, catalogRes] = await Promise.all([
        ids.length
          ? client.from("exercises").select("id, name, muscle_group, description, image_path, created_by, created_at").in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? client
            .from("workout_sets")
            .select("exercise_id, weight, reps, set_number, workout_id, workouts!inner(performed_at, created_at)")
            .eq("user_id", current.user_id)
            .in("exercise_id", ids)
            .neq("workout_id", id)
          : Promise.resolve({ data: [], error: null }),
        client.from("exercises").select("id, name, muscle_group, description, image_path, created_by, created_at").order("name"),
      ]);
      if (!active) return;
      if (exerciseRes.error || historyRes.error || catalogRes.error) {
        setPhase("error");
        return;
      }

      const catalogList = asList(catalogRes.data, asExercise);
      setsRef.current = nextSets;
      for (const set of nextSets) {
        const prev = numbersRef.current.get(set.exercise_id) ?? 0;
        if (set.set_number > prev) numbersRef.current.set(set.exercise_id, set.set_number);
      }
      setWorkout(current);
      setSets(nextSets);
      setExercises(asList(exerciseRes.data, asExercise));
      setCatalog(catalogList);
      setHistory((existing) => mergeHistory(existing, parseHistory(historyRes.data), ids));
      setPending((existing) => {
        const next = mergePending(existing, readPending(id), catalogList);
        pendingRef.current = next;
        return next;
      });
      if (reload === 0) {
        setNote(current.note ?? "");
        setTitle(current.title ?? "");
      }
      setPhase("ready");
    }

    void load();
    return () => {
      active = false;
    };
  }, [id, reload]);

  const blocks = useMemo(() => {
    const known = new Map<string, Exercise>();
    for (const exercise of [...exercises, ...pending, ...catalog]) known.set(exercise.id, exercise);
    const ids: string[] = [];
    for (const set of [...sets].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!ids.includes(set.exercise_id)) ids.push(set.exercise_id);
    }
    for (const exercise of pending) {
      if (!ids.includes(exercise.id)) ids.push(exercise.id);
    }
    if (!workout) return [];
    return ids.flatMap((exerciseId) => {
      const exercise = known.get(exerciseId);
      if (!exercise) return [];
      return [{
        exercise,
        sets: sets.filter((set) => set.exercise_id === exerciseId).sort((a, b) => a.set_number - b.set_number),
        previous: previousSessionSets(history, exerciseId, workout),
      }];
    });
  }, [catalog, exercises, history, pending, sets, workout]);

  async function loadExerciseHistory(exerciseId: string) {
    if (!supabase || !workout) return;
    const { data, error: historyError } = await supabase
      .from("workout_sets")
      .select("exercise_id, weight, reps, set_number, workout_id, workouts!inner(performed_at, created_at)")
      .eq("user_id", workout.user_id)
      .eq("exercise_id", exerciseId)
      .neq("workout_id", workout.id);
    if (historyError) return;
    setHistory((current) => mergeHistory(current, parseHistory(data), [exerciseId]));
  }

  function replaceSets(next: WorkoutSet[]) {
    setsRef.current = next;
    setSets(next);
  }

  function nextSetNumber(exerciseId: string) {
    const fromList = setsRef.current
      .filter((set) => set.exercise_id === exerciseId)
      .reduce((max, set) => Math.max(max, set.set_number), 0);
    const next = Math.max(fromList, numbersRef.current.get(exerciseId) ?? 0) + 1;
    numbersRef.current.set(exerciseId, next);
    return next;
  }

  function enqueue<T>(id: string, job: () => Promise<T>): Promise<T> {
    const prev = tailsRef.current.get(id) ?? Promise.resolve();
    const run = prev.then(job, job);
    tailsRef.current.set(id, run);
    setWrites((count) => count + 1);
    void run.finally(() => setWrites((count) => count - 1));
    return run;
  }

  function restoreSets(sets: WorkoutSet[]) {
    const have = new Set(setsRef.current.map((set) => set.id));
    const missing = sets.filter((set) => !have.has(set.id));
    if (missing.length === 0) return;
    replaceSets([...setsRef.current, ...missing]);
  }

  async function addSet(exerciseId: string, weight: number, reps: number) {
    if (!supabase || !profile || !workout) return false;
    const client = supabase;
    const userId = profile.id;
    const workoutId = workout.id;
    setError("");
    const created: WorkoutSet = {
      id: crypto.randomUUID(),
      workout_id: workoutId,
      user_id: userId,
      exercise_id: exerciseId,
      set_number: nextSetNumber(exerciseId),
      weight,
      reps,
      created_at: new Date().toISOString(),
    };
    replaceSets([...setsRef.current, created]);
    const generation = restGen.current + 1;
    restGen.current = generation;
    setRestUntil(Date.now() + REST_MS);
    return enqueue(created.id, async () => {
      try {
        if (removedRef.current.has(created.id)) return true;
        const latest = setsRef.current.find((set) => set.id === created.id) ?? created;
        const { error: insertError } = await client.from("workout_sets").insert({
          id: latest.id,
          workout_id: latest.workout_id,
          user_id: latest.user_id,
          exercise_id: latest.exercise_id,
          set_number: latest.set_number,
          weight: latest.weight,
          reps: latest.reps,
        });
        if (removedRef.current.has(created.id)) return true;
        if (!insertError) return true;
      } catch {
        // Rollback below covers a thrown request.
      }
      if (removedRef.current.has(created.id)) return true;
      replaceSets(setsRef.current.filter((set) => set.id !== created.id));
      if (restGen.current === generation) {
        setRestUntil(null);
        cancelLockScreenArm();
      }
      setError(uk.workout.saveError);
      return false;
    });
  }

  async function updateSet(set: WorkoutSet, weight: number, reps: number) {
    if (!supabase) return false;
    const client = supabase;
    setError("");
    const previous = setsRef.current.find((item) => item.id === set.id) ?? set;
    replaceSets(setsRef.current.map((item) => item.id === set.id ? { ...item, weight, reps } : item));
    return enqueue(set.id, async () => {
      let failed = false;
      try {
        if (removedRef.current.has(set.id)) return false;
        const { error: updateError } = await client.from("workout_sets").update({ weight, reps }).eq("id", set.id);
        if (removedRef.current.has(set.id)) return false;
        failed = updateError !== null;
      } catch {
        failed = true;
      }
      if (!failed) return true;
      const current = setsRef.current.find((item) => item.id === set.id);
      if (current && current.weight === weight && current.reps === reps) {
        replaceSets(setsRef.current.map((item) => item.id === set.id ? previous : item));
      }
      setError(uk.workout.saveError);
      return false;
    });
  }

  async function deleteSet(set: WorkoutSet) {
    if (!supabase) return;
    const client = supabase;
    setError("");
    removedRef.current.add(set.id);
    replaceSets(setsRef.current.filter((item) => item.id !== set.id));
    await enqueue(set.id, async () => {
      let failed = false;
      try {
        const { error: deleteError } = await client.from("workout_sets").delete().eq("id", set.id);
        failed = deleteError !== null;
      } catch {
        failed = true;
      }
      if (!failed) return;
      removedRef.current.delete(set.id);
      restoreSets([set]);
      setError(uk.workout.saveError);
    });
  }

  async function removeExercise(exercise: Exercise) {
    const related = setsRef.current.filter((set) => set.exercise_id === exercise.id);
    const wasPending = pendingRef.current.some((item) => item.id === exercise.id);
    setRemoveTarget(null);
    if (related.length === 0) {
      const next = pendingRef.current.filter((item) => item.id !== exercise.id);
      pendingRef.current = next;
      setPending(next);
      return;
    }
    if (!supabase) return;
    const client = supabase;
    setError("");
    for (const set of related) removedRef.current.add(set.id);
    const nextPending = pendingRef.current.filter((item) => item.id !== exercise.id);
    pendingRef.current = nextPending;
    setPending(nextPending);
    replaceSets(setsRef.current.filter((set) => set.exercise_id !== exercise.id));
    const failed = (await Promise.all(related.map((set) => enqueue(set.id, async () => {
      let deleteFailed = false;
      try {
        const { error: deleteError } = await client.from("workout_sets").delete().eq("id", set.id);
        deleteFailed = deleteError !== null;
      } catch {
        deleteFailed = true;
      }
      if (!deleteFailed) return null;
      removedRef.current.delete(set.id);
      return set;
    })))).filter((set): set is WorkoutSet => set !== null);
    if (failed.length === 0) return;
    restoreSets(failed);
    if (wasPending && !pendingRef.current.some((item) => item.id === exercise.id)) {
      pendingRef.current = [...pendingRef.current, exercise];
      setPending(pendingRef.current);
    }
    setError(uk.workout.saveError);
  }

  async function changeDate(performedAt: string) {
    if (!supabase || !workout || !performedAt) return;
    setWorkout({ ...workout, performed_at: performedAt });
    const { error: updateError } = await supabase.from("workouts").update({ performed_at: performedAt }).eq("id", workout.id);
    if (updateError) setError(uk.workout.saveError);
  }

  function changeSettings(next: ProgressionSettings) {
    setSettings(next);
    if (!Number.isInteger(next.repMin) || !Number.isInteger(next.repMax) || next.repMin < 1 || next.repMax > 30 || next.repMin >= next.repMax) {
      setSettingsError(uk.workout.rangeError);
      return;
    }
    if (!Number.isFinite(next.weightStep) || next.weightStep <= 0 || next.weightStep > 50 || !isHalfStep(next.weightStep)) {
      setSettingsError(uk.errors.weightStep);
      return;
    }
    setSettingsError("");
    saveProgressionSettings(next);
  }

  async function deleteWorkout() {
    if (!supabase) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from("workouts").delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      setError(uk.workout.saveError);
      setDeleteOpen(false);
      return;
    }
    goBack();
  }

  async function repeatThis() {
    if (!profile || repeating || sets.length === 0) return;
    setRepeating(true);
    setError("");
    const result = await repeatWorkout(profile.id, id);
    setRepeating(false);
    if (!result.ok) {
      setError(result.reason === "empty" ? uk.workout.noSets : uk.workout.saveError);
      return;
    }
    navigate(`/workout/${result.id}`);
  }

  function goBack() {
    if (location.key === "default") navigate("/workout");
    else navigate(-1);
  }

  if (phase === "loading") return <Loading />;
  if (phase === "error") return <ErrorState message={uk.workout.error} onRetry={() => setReload((value) => value + 1)} />;
  if (phase === "missing" || !workout) return <ErrorState message={uk.workout.notFound} />;

  return (
    <div className={restUntil ? "space-y-4 pb-28" : "space-y-4"}>
      <BackButton onClick={goBack} />
      <h1 className="text-2xl font-semibold">{uk.workout.title}</h1>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{uk.workout.date}</span>
        <input className={fieldClass} type="date" value={workout.performed_at} onChange={(event) => void changeDate(event.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{uk.workout.workoutName}</span>
        <input
          className={fieldClass}
          value={title}
          placeholder={uk.workout.workoutNamePlaceholder}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{uk.workout.note}</span>
        <textarea
          className={`${fieldClass} h-24 py-3`}
          value={note}
          placeholder={uk.workout.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        type="button"
        className={secondaryButton}
        disabled={repeating || busy || writes > 0 || sets.length === 0}
        onClick={() => void repeatThis()}
      >
        {repeating ? uk.workout.repeating : uk.workout.repeatThis}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {blocks.map((block) => (
        <ExerciseBlock
          key={block.exercise.id}
          exercise={block.exercise}
          sets={block.sets}
          previous={block.previous}
          settings={settings}
          busy={busy}
          onAdd={(weight, reps) => addSet(block.exercise.id, weight, reps)}
          onUpdate={updateSet}
          onDelete={deleteSet}
          onRemove={() => setRemoveTarget(block.exercise)}
        />
      ))}
      <button type="button" className={secondaryButton} onClick={() => setPickerOpen(true)}>
        {uk.workout.addExercise}
      </button>
      <details className="rounded-3xl border border-line bg-panel p-4">
        <summary className="cursor-pointer font-medium">{uk.workout.progression}</summary>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="block text-sm text-muted">
            {uk.workout.repMin}
            <input
              className={`${fieldClass} mt-1`}
              type="number"
              min={1}
              max={30}
              value={settings.repMin}
              onChange={(event) => changeSettings({ ...settings, repMin: Number(event.target.value) })}
            />
          </label>
          <label className="block text-sm text-muted">
            {uk.workout.repMax}
            <input
              className={`${fieldClass} mt-1`}
              type="number"
              min={1}
              max={30}
              value={settings.repMax}
              onChange={(event) => changeSettings({ ...settings, repMax: Number(event.target.value) })}
            />
          </label>
          <label className="block text-sm text-muted">
            {uk.workout.weightStep}
            <input
              className={`${fieldClass} mt-1`}
              type="number"
              min={0.5}
              step={0.5}
              value={settings.weightStep}
              onChange={(event) => changeSettings({ ...settings, weightStep: Number(event.target.value) })}
            />
          </label>
        </div>
        {settingsError ? <p className="mt-2 text-sm text-danger">{settingsError}</p> : null}
      </details>
      <button type="button" className={dangerOutline} disabled={busy || writes > 0} onClick={() => setDeleteOpen(true)}>
        {uk.workout.deleteWorkout}
      </button>
      {pickerOpen ? (
        <ExercisePicker
          exercises={catalog}
          takenIds={blocks.map((block) => block.exercise.id)}
          onClose={() => setPickerOpen(false)}
          onPick={(exercise) => {
            if (!pendingRef.current.some((item) => item.id === exercise.id)) {
              const next = [...pendingRef.current, exercise];
              pendingRef.current = next;
              setPending(next);
            }
            setPickerOpen(false);
            void loadExerciseHistory(exercise.id);
          }}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          body={
            sets.some((set) => set.exercise_id === removeTarget.id)
              ? fill(uk.workout.removeExerciseConfirm, { name: removeTarget.name })
              : undefined
          }
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void removeExercise(removeTarget)}
        />
      ) : null}
      {deleteOpen ? (
        <ConfirmDialog
          body={uk.workout.deleteWorkoutConfirm}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void deleteWorkout()}
        />
      ) : null}
      {restUntil ? <RestTimer until={restUntil} onClose={() => setRestUntil(null)} /> : null}
    </div>
  );
}
