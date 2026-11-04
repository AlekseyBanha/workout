import { useMemo, useState } from "react";
import { muscleGroups, uk } from "../../i18n/uk.ts";
import { exerciseImageUrl } from "../../lib/supabase.ts";
import type { Exercise } from "../../lib/types.ts";
import { ExerciseThumb, fieldClass, Sheet } from "../ui.tsx";

export function ExercisePicker({
  exercises,
  takenIds,
  onClose,
  onPick,
}: {
  exercises: Exercise[];
  takenIds: string[];
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk");
    return exercises.filter((exercise) => {
      const matchesName = !needle || exercise.name.toLocaleLowerCase("uk").includes(needle);
      const matchesMuscle = !muscle || exercise.muscle_group === muscle;
      return matchesName && matchesMuscle;
    });
  }, [exercises, muscle, query]);

  return (
    <Sheet title={uk.workout.addExercise} onClose={onClose}>
      <div className="space-y-3">
        <input
          className={fieldClass}
          value={query}
          autoFocus
          placeholder={uk.workout.searchExercise}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="block">
          <span className="sr-only">{uk.exercises.filter}</span>
          <select className={fieldClass} value={muscle} onChange={(event) => setMuscle(event.target.value)}>
            <option value="">{uk.muscles.all}</option>
            {muscleGroups.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
      </div>
      {exercises.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{uk.workout.catalogEmpty}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{uk.workout.noExerciseMatch}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((exercise) => {
            const taken = takenIds.includes(exercise.id);
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  disabled={taken}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line px-3 py-2 text-left disabled:opacity-50"
                  onClick={() => onPick(exercise)}
                >
                  <span className="h-12 w-12 overflow-hidden rounded-xl">
                    <ExerciseThumb src={exerciseImageUrl(exercise.image_path)} alt="" />
                  </span>
                  <span>
                    <span className="block font-medium">{exercise.name}</span>
                    <span className="block text-sm text-muted">
                      {taken ? uk.workout.alreadyAdded : exercise.muscle_group}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
