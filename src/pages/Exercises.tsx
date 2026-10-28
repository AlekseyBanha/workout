import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { muscleGroups, uk } from "../i18n/uk.ts";
import { exerciseImageUrl, supabase } from "../lib/supabase.ts";
import { asExercise, asList, type Exercise } from "../lib/types.ts";
import { EmptyState, ErrorState, ExerciseThumb, Loading, fieldClass, useTitle } from "../components/ui.tsx";

export function ExercisesPage() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  useTitle(uk.exercises.title);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("exercises")
      .select("id, name, muscle_group, description, image_path, created_by, created_at")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPhase("error");
          return;
        }
        setItems(asList(data, asExercise));
        setPhase("ready");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk");
    return items.filter((exercise) => {
      const matchesName = !needle || exercise.name.toLocaleLowerCase("uk").includes(needle);
      const matchesMuscle = !muscle || exercise.muscle_group === muscle;
      return matchesName && matchesMuscle;
    });
  }, [items, muscle, query]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.exercises.title}</h1>
      <input
        className={fieldClass}
        value={query}
        placeholder={uk.exercises.search}
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
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.exercises.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && items.length === 0 ? <EmptyState title={uk.exercises.empty} text={uk.exercises.emptyHint} /> : null}
      {phase === "ready" && items.length > 0 && filtered.length === 0 ? <EmptyState title={uk.exercises.noMatch} /> : null}
      {phase === "ready" && filtered.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {filtered.map((exercise) => (
            <li key={exercise.id}>
              <Link to={`/exercises/${exercise.id}`} className="block overflow-hidden rounded-3xl border border-line bg-panel">
                <span className="block aspect-square">
                  <ExerciseThumb src={exerciseImageUrl(exercise.image_path)} alt="" />
                </span>
                <span className="block px-3 py-3">
                  <span className="block font-medium">{exercise.name}</span>
                  <span className="block text-sm text-muted">{exercise.muscle_group ?? uk.muscles.none}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
