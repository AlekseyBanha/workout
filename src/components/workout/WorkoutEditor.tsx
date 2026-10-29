import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { uk } from "../../i18n/uk.ts";
import { useAuth } from "../../lib/auth.tsx";
import { isHalfStep } from "../../lib/numbers.ts";
import { previousSessionSets, type HistorySet, type ProgressionSettings } from "../../lib/progression.ts";
import { loadProgressionSettings, saveProgressionSettings } from "../../lib/settings.ts";
import { supabase } from "../../lib/supabase.ts";
import { asExercise, asList, asSet, asStringRecord, asWorkout, type Exercise, type Workout, type WorkoutSet } from "../../lib/types.ts";
import { ConfirmDialog, ErrorState, fieldClass, Loading, secondaryButton, useTitle } from "../ui.tsx";
import { ExerciseBlock } from "./ExerciseBlock.tsx";
import { ExercisePicker } from "./ExercisePicker.tsx";

function mergeHistory(current: HistorySet[], incoming: HistorySet[], exerciseIds: string[]): HistorySet[] {
  const replace = new Set(exerciseIds);
  return [...current.filter((row) => !replace.has(row.exercise_id)), ...incoming];
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
  const { profile } = useAuth();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<HistorySet[]>([]);
  const [pending, setPending] = useState<Exercise[]>([]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"loading" | "error" | "missing" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Exercise | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settings, setSettings] = useState<ProgressionSettings>(loadProgressionSettings);
  const [settingsError, setSettingsError] = useState("");
  const noteReady = useRef(false);
  useTitle(uk.workout.title);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    if (reload === 0) setPhase("loading");

    async function load() {
      const client = supabase;
      if (!client) return;
      const workoutRes = await client.from("workouts").select("id, user_id, performed_at, note, created_at").eq("id", id).maybeSingle();
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

      setWorkout(current);
      setSets(nextSets);
      setExercises(asList(exerciseRes.data, asExercise));
      setCatalog(asList(catalogRes.data, asExercise));
      setHistory((existing) => mergeHistory(existing, parseHistory(historyRes.data), ids));
      if (reload === 0) setNote(current.note ?? "");
      setPhase("ready");
    }

    void load();
    return () => {
      active = false;
    };
  }, [id, reload]);

  useEffect(() => {
    if (phase !== "ready" || !supabase) return;
    if (!noteReady.current) {
      noteReady.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void supabase?.from("workouts").update({ note: note.trim() || null }).eq("id", id);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [note, phase, id]);

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

  async function addSet(exerciseId: string, weight: number, reps: number) {
    if (!supabase || !profile || !workout) return false;
    setBusy(true);
    setError("");
    const setNumber = (sets.filter((set) => set.exercise_id === exerciseId).at(-1)?.set_number ?? 0) + 1;
    const { error: insertError } = await supabase.from("workout_sets").insert({
      workout_id: workout.id,
      user_id: profile.id,
      exercise_id: exerciseId,
      set_number: setNumber,
      weight,
      reps,
    });
    setBusy(false);
    if (insertError) {
      setError(uk.workout.saveError);
      return false;
    }
    setReload((value) => value + 1);
    return true;
  }

  async function updateSet(set: WorkoutSet, weight: number, reps: number) {
    if (!supabase) return false;
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("workout_sets").update({ weight, reps }).eq("id", set.id);
    setBusy(false);
    if (updateError) {
      setError(uk.workout.saveError);
      return false;
    }
    setReload((value) => value + 1);
    return true;
  }

  async function deleteSet(set: WorkoutSet) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.from("workout_sets").delete().eq("id", set.id);
    setBusy(false);
    if (deleteError) {
      setError(uk.workout.saveError);
      return;
    }
    setReload((value) => value + 1);
  }

  async function removeExercise(exercise: Exercise) {
    const related = sets.filter((set) => set.exercise_id === exercise.id);
    if (related.length === 0) {
      setPending((current) => current.filter((item) => item.id !== exercise.id));
      setRemoveTarget(null);
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.from("workout_sets").delete().in("id", related.map((set) => set.id));
    setBusy(false);
    setRemoveTarget(null);
    if (deleteError) {
      setError(uk.workout.saveError);
      return;
    }
    setPending((current) => current.filter((item) => item.id !== exercise.id));
    setReload((value) => value + 1);
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
    navigate("/workout");
  }

  if (phase === "loading") return <Loading />;
  if (phase === "error") return <ErrorState message={uk.workout.error} onRetry={() => setReload((value) => value + 1)} />;
  if (phase === "missing" || !workout) return <ErrorState message={uk.workout.notFound} />;

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm text-muted" onClick={() => navigate("/workout")}>
        {uk.back}
      </button>
      <h1 className="text-2xl font-semibold">{uk.workout.title}</h1>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{uk.workout.date}</span>
        <input className={fieldClass} type="date" value={workout.performed_at} onChange={(event) => void changeDate(event.target.value)} />
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
          onRemove={() => {
            if (block.sets.length === 0) {
              setPending((current) => current.filter((item) => item.id !== block.exercise.id));
              return;
            }
            setRemoveTarget(block.exercise);
          }}
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
      <button type="button" className="text-sm text-danger" onClick={() => setDeleteOpen(true)}>
        {uk.workout.deleteWorkout}
      </button>
      {pickerOpen ? (
        <ExercisePicker
          exercises={catalog}
          takenIds={blocks.map((block) => block.exercise.id)}
          onClose={() => setPickerOpen(false)}
          onPick={(exercise) => {
            setPending((current) => current.some((item) => item.id === exercise.id) ? current : [...current, exercise]);
            setPickerOpen(false);
            void loadExerciseHistory(exercise.id);
          }}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title={uk.workout.removeExercise}
          body={uk.workout.removeExerciseConfirm.replace("{name}", removeTarget.name)}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void removeExercise(removeTarget)}
        />
      ) : null}
      {deleteOpen ? (
        <ConfirmDialog
          title={uk.workout.deleteWorkout}
          body={uk.workout.deleteWorkoutConfirm}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void deleteWorkout()}
        />
      ) : null}
    </div>
  );
}
