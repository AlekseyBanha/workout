import { useEffect, useMemo, useRef, useState } from "react";
import { fill, uk } from "../../i18n/uk.ts";
import { formatWeight, isHalfStep, parseDecimal } from "../../lib/numbers.ts";
import {
  prefillForNextSet,
  previousSetFor,
  suggestProgression,
  type ProgressionSettings,
  type ProgressionSuggestion,
  type SetSnapshot,
} from "../../lib/progression.ts";
import type { Exercise, WorkoutSet } from "../../lib/types.ts";
import { chipButton, chipDanger, fieldClass, numberClass, primaryButton } from "../ui.tsx";

type Draft = { weight: string; reps: string };

function draftFrom(weight: number, reps: number): Draft {
  return { weight: formatWeight(weight), reps: String(reps) };
}

function draftMatches(draft: Draft, suggestion: ProgressionSuggestion): boolean {
  const weight = parseDecimal(draft.weight);
  const reps = Number(draft.reps);
  return weight === suggestion.weight && reps === suggestion.reps;
}

export function ExerciseBlock({
  exercise,
  sets,
  previous,
  settings,
  busy,
  onAdd,
  onUpdate,
  onDelete,
  onRemove,
}: {
  exercise: Exercise;
  sets: WorkoutSet[];
  previous: SetSnapshot[];
  settings: ProgressionSettings;
  busy: boolean;
  onAdd: (weight: number, reps: number) => Promise<boolean>;
  onUpdate: (set: WorkoutSet, weight: number, reps: number) => Promise<boolean>;
  onDelete: (set: WorkoutSet) => Promise<void>;
  onRemove: () => void;
}) {
  const nextNumber = (sets[sets.length - 1]?.set_number ?? 0) + 1;
  const [draft, setDraft] = useState<Draft>({ weight: "", reps: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ weight: "", reps: "" });
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(0);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    const prefill = prefillForNextSet(previous, nextNumber);
    if (!prefill) return;
    seeded.current = true;
    setDraft((current) => (current.weight || current.reps ? current : draftFrom(prefill.weight, prefill.reps)));
  }, [previous, nextNumber]);

  const suggestion = useMemo(
    () => suggestProgression(previous, nextNumber, settings),
    [previous, nextNumber, settings],
  );
  const source = useMemo(() => previousSetFor(previous, nextNumber), [previous, nextNumber]);
  const applied = suggestion ? draftMatches(draft, suggestion) : false;

  useEffect(() => {
    if (pulse === 0) return;
    const timer = window.setTimeout(() => setPulse(0), 700);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  function applySuggestion() {
    if (!suggestion) return;
    setDraft(draftFrom(suggestion.weight, suggestion.reps));
    setError("");
    setPulse((value) => value + 1);
  }

  function readDraft(value: Draft): { weight: number; reps: number } | null {
    const weight = parseDecimal(value.weight);
    const reps = Number(value.reps);
    if (weight === null || weight <= 0 || weight > 999 || !isHalfStep(weight)) {
      setError(weight === null || weight <= 0 ? uk.errors.weight : uk.errors.weightStep);
      return null;
    }
    if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
      setError(uk.errors.reps);
      return null;
    }
    setError("");
    return { weight, reps };
  }

  async function addSet() {
    const parsed = readDraft(draft);
    if (!parsed) return;
    const ok = await onAdd(parsed.weight, parsed.reps);
    if (!ok) return;
    const following = prefillForNextSet(previous, nextNumber + 1);
    setDraft(following ? draftFrom(following.weight, following.reps) : { weight: "", reps: "" });
  }

  return (
    <section className="rounded-3xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{exercise.name}</h3>
          {exercise.muscle_group ? <p className="text-sm text-muted">{exercise.muscle_group}</p> : null}
        </div>
        <button type="button" className={`${chipDanger} shrink-0 whitespace-nowrap`} onClick={onRemove}>
          {uk.workout.removeExercise}
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-ink px-3 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">{uk.workout.lastTime}</p>
        {previous.length === 0 ? (
          <p className="mt-1 text-sm">{uk.workout.noHistory}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {previous.map((set) => (
              <li
                key={set.set_number}
                className={`rounded-full px-3 py-1 text-sm tabular-nums ${source?.set_number === set.set_number ? "bg-lime/15 text-lime" : "bg-panel-2"}`}
              >
                {formatWeight(set.weight)} {uk.kg} × {set.reps}
              </li>
            ))}
          </ul>
        )}
      </div>

      {suggestion ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-lime/10 px-3 py-3">
          <p className="text-sm font-medium text-lime">
            {suggestion.kind === "weight"
              ? fill(uk.workout.suggestWeight, {
                step: formatWeight(suggestion.step),
                weight: formatWeight(suggestion.weight),
                reps: suggestion.reps,
              })
              : fill(uk.workout.suggestReps, {
                step: suggestion.step,
                weight: formatWeight(suggestion.weight),
                reps: suggestion.reps,
              })}
          </p>
          <button
            type="button"
            className="rounded-full bg-lime px-3 py-1.5 text-sm font-semibold text-ink"
            onPointerDown={(event) => {
              event.preventDefault();
              applySuggestion();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              applySuggestion();
            }}
          >
            {applied ? uk.workout.applied : uk.workout.apply}
          </button>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {sets.map((set) => (
          <li key={set.id} className="rounded-2xl border border-line px-3 py-2">
            {editingId === set.id ? (
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  aria-label={uk.workout.weight}
                  value={editDraft.weight}
                  onChange={(event) => setEditDraft((current) => ({ ...current, weight: event.target.value }))}
                />
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  aria-label={uk.workout.reps}
                  value={editDraft.reps}
                  onChange={(event) => setEditDraft((current) => ({ ...current, reps: event.target.value }))}
                />
                <button
                  type="button"
                  className="h-12 rounded-xl bg-lime px-3 text-sm font-semibold text-ink"
                  disabled={busy}
                  onClick={() => {
                    const parsed = readDraft(editDraft);
                    if (!parsed) return;
                    void onUpdate(set, parsed.weight, parsed.reps).then((ok) => {
                      if (ok) setEditingId(null);
                    });
                  }}
                >
                  {uk.save}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="tabular-nums">
                  <span className="mr-2 text-muted">{set.set_number}</span>
                  {formatWeight(set.weight)} {uk.kg} × {set.reps}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={chipButton}
                    onClick={() => {
                      setEditingId(set.id);
                      setEditDraft(draftFrom(set.weight, set.reps));
                      setError("");
                    }}
                  >
                    {uk.edit}
                  </button>
                  <button type="button" className={chipDanger} onClick={() => void onDelete(set)}>
                    {uk.delete}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberStepper
          label={uk.workout.weight}
          value={draft.weight}
          step={0.5}
          pulse={pulse > 0}
          onChange={(weight) => setDraft((current) => ({ ...current, weight }))}
        />
        <NumberStepper
          label={uk.workout.reps}
          value={draft.reps}
          step={1}
          integer
          pulse={pulse > 0}
          onChange={(reps) => setDraft((current) => ({ ...current, reps }))}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button type="button" className={`${primaryButton} mt-3`} disabled={busy} onClick={() => void addSet()}>
        {uk.workout.addSet}
      </button>
    </section>
  );
}

function NumberStepper({
  label,
  value,
  step,
  integer = false,
  pulse = false,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  integer?: boolean;
  pulse?: boolean;
  onChange: (value: string) => void;
}) {
  function bump(direction: number) {
    const current = parseDecimal(value) ?? 0;
    const next = Math.max(step, current + direction * step);
    onChange(integer ? String(Math.round(next)) : formatWeight(next));
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <div className="grid grid-cols-[3rem_1fr_3rem] gap-2">
        <button type="button" className="h-16 rounded-2xl border border-line text-2xl" aria-label={uk.workout.decrease} onClick={() => bump(-1)}>
          −
        </button>
        <input
          className={`${numberClass}${pulse ? " ring-2 ring-lime" : ""}`}
          inputMode={integer ? "numeric" : "decimal"}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="h-16 rounded-2xl border border-line text-2xl" aria-label={uk.workout.increase} onClick={() => bump(1)}>
          +
        </button>
      </div>
    </div>
  );
}
