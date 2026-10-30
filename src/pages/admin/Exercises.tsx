import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { fill, muscleGroups, uk } from "../../i18n/uk.ts";
import { compressExerciseImage, type CompressedImage } from "../../lib/image.ts";
import { formatKb } from "../../lib/numbers.ts";
import { exerciseImageUrl, supabase } from "../../lib/supabase.ts";
import { asExercise, asList, type Exercise } from "../../lib/types.ts";
import { useAuth } from "../../lib/auth.tsx";
import {
  chipButton,
  chipDanger,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ExerciseThumb,
  Field,
  Loading,
  Sheet,
  fieldClass,
  primaryButton,
  useTitle,
} from "../../components/ui.tsx";

const exerciseSchema = z.object({
  name: z.string().trim().min(1, uk.errors.exerciseName).max(120),
  muscle_group: z.string().max(40),
  description: z.string().trim().max(2000),
});

type PhotoDraft = CompressedImage & { url: string };

function issues(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

export function AdminExercisesPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);
  useTitle(uk.admin.exercises);

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

  function openCreate() {
    if (photo) URL.revokeObjectURL(photo.url);
    setEditing("new");
    setName("");
    setMuscleGroup("");
    setDescription("");
    setPhoto(null);
    setRemovePhoto(false);
    setFieldError({});
    setFormError("");
  }

  function openEdit(exercise: Exercise) {
    if (photo) URL.revokeObjectURL(photo.url);
    setEditing(exercise);
    setName(exercise.name);
    setMuscleGroup(exercise.muscle_group ?? "");
    setDescription(exercise.description ?? "");
    setPhoto(null);
    setRemovePhoto(false);
    setFieldError({});
    setFormError("");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFormError("");
    try {
      const compressed = await compressExerciseImage(file);
      const url = URL.createObjectURL(compressed.blob);
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { ...compressed, url };
      });
      setRemovePhoto(false);
    } catch {
      setFormError(uk.admin.photoFailed);
    }
  }

  async function uploadPhoto(exerciseId: string, draft: PhotoDraft): Promise<string> {
    if (!supabase) throw new Error("config");
    const path = `${exerciseId}/${crypto.randomUUID()}.${draft.ext}`;
    const { error } = await supabase.storage.from("exercise-images").upload(path, draft.blob, {
      contentType: draft.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async function removeStoredPhoto(path: string | null) {
    if (!path || !supabase) return;
    const { error } = await supabase.storage.from("exercise-images").remove([path]);
    if (error) throw error;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !profile || !editing) return;
    const parsed = exerciseSchema.safeParse({ name, muscle_group: muscleGroup, description });
    if (!parsed.success) {
      setFieldError(issues(parsed.error));
      return;
    }
    setFieldError({});
    setBusy(true);
    setFormError("");
    const payload = {
      name: parsed.data.name,
      muscle_group: parsed.data.muscle_group || null,
      description: parsed.data.description || null,
    };

    try {
      if (editing === "new") {
        const { data, error } = await supabase
          .from("exercises")
          .insert({ ...payload, created_by: profile.id })
          .select("id, name, muscle_group, description, image_path, created_by, created_at")
          .single();
        if (error) throw error;
        const created = asExercise(data);
        if (!created) throw new Error("save");
        if (photo) {
          const path = await uploadPhoto(created.id, photo);
          const { error: updateError } = await supabase.from("exercises").update({ image_path: path }).eq("id", created.id);
          if (updateError) {
            await removeStoredPhoto(path);
            throw updateError;
          }
        }
      } else {
        let imagePath = editing.image_path;
        const previous = editing.image_path;
        if (photo) {
          imagePath = await uploadPhoto(editing.id, photo);
        } else if (removePhoto) {
          imagePath = null;
        }
        const { error } = await supabase.from("exercises").update({ ...payload, image_path: imagePath }).eq("id", editing.id);
        if (error) {
          if (photo && imagePath && imagePath !== previous) await removeStoredPhoto(imagePath);
          throw error;
        }
        if ((photo || removePhoto) && previous && previous !== imagePath) {
          await removeStoredPhoto(previous);
        }
      }
      setEditing(null);
      setReload((value) => value + 1);
    } catch {
      setFormError(uk.workout.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteExercise() {
    if (!supabase || !deleteTarget) return;
    setBusy(true);
    setFormError("");
    const { count, error: countError } = await supabase
      .from("workout_sets")
      .select("id", { count: "exact", head: true })
      .eq("exercise_id", deleteTarget.id);
    if (countError) {
      setBusy(false);
      setFormError(uk.workout.saveError);
      return;
    }
    if ((count ?? 0) > 0) {
      setBusy(false);
      setFormError(uk.admin.hasSets);
      return;
    }
    if (deleteTarget.image_path) {
      const { error: storageError } = await supabase.storage.from("exercise-images").remove([deleteTarget.image_path]);
      if (storageError) {
        setBusy(false);
        setFormError(uk.workout.saveError);
        return;
      }
    }
    const { error } = await supabase.from("exercises").delete().eq("id", deleteTarget.id);
    setBusy(false);
    if (error) {
      setFormError(uk.admin.hasSets);
      return;
    }
    setDeleteTarget(null);
    setEditing(null);
    setReload((value) => value + 1);
  }

  const currentImage = editing && editing !== "new" ? exerciseImageUrl(editing.image_path) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{uk.admin.exercises}</h1>
        <button type="button" className={`${primaryButton} w-auto px-4`} onClick={openCreate}>
          {uk.admin.createExercise}
        </button>
      </div>
      <input className={fieldClass} value={query} placeholder={uk.exercises.search} onChange={(event) => setQuery(event.target.value)} />
      <select className={fieldClass} value={muscle} onChange={(event) => setMuscle(event.target.value)}>
        <option value="">{uk.muscles.all}</option>
        {muscleGroups.map((group) => (
          <option key={group} value={group}>{group}</option>
        ))}
      </select>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.admin.exercisesError} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && items.length === 0 ? <EmptyState title={uk.admin.exercisesEmpty} /> : null}
      {phase === "ready" && items.length > 0 && filtered.length === 0 ? <EmptyState title={uk.exercises.noMatch} /> : null}
      {phase === "ready" && filtered.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((exercise) => (
            <li key={exercise.id} className="flex gap-3 rounded-3xl border border-line bg-panel p-3">
              <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                <ExerciseThumb src={exerciseImageUrl(exercise.image_path)} alt="" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{exercise.name}</span>
                <span className="block text-sm text-muted">{exercise.muscle_group ?? uk.muscles.none}</span>
                <span className="mt-2 flex gap-2">
                  <button type="button" className={chipButton} onClick={() => openEdit(exercise)}>{uk.edit}</button>
                  <button type="button" className={chipDanger} onClick={() => { setFormError(""); setDeleteTarget(exercise); }}>{uk.delete}</button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {formError && !editing ? <p className="text-sm text-danger">{formError}</p> : null}
      {editing ? (
        <Sheet title={editing === "new" ? uk.admin.createExercise : uk.admin.editExercise} onClose={() => setEditing(null)}>
          <form className="space-y-3" noValidate onSubmit={(event) => void save(event)}>
            <Field label={uk.admin.exerciseName} error={fieldError.name}>
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={uk.admin.muscle}>
              <select className={fieldClass} value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>
                <option value="">{uk.admin.musclePlaceholder}</option>
                {muscleGroups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </Field>
            <Field label={uk.admin.description}>
              <textarea className={`${fieldClass} h-28 py-3`} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <div>
              <span className="mb-1.5 block text-sm text-muted">{uk.admin.photo}</span>
              <p className="mb-2 text-xs text-muted">{uk.admin.photoHint}</p>
              <input
                className="block w-full text-sm"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
              {photo ? (
                <div className="mt-3">
                  <img src={photo.url} alt={uk.admin.photo} className="aspect-square w-full rounded-2xl object-cover" />
                  <p className="mt-1 text-sm text-muted">{fill(uk.admin.photoSize, { size: formatKb(photo.blob.size) })}</p>
                </div>
              ) : currentImage && !removePhoto ? (
                <img src={currentImage} alt={name} className="mt-3 aspect-square w-full rounded-2xl object-cover" />
              ) : null}
              {editing !== "new" && editing.image_path && !photo ? (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} />
                  {uk.admin.removePhoto}
                </label>
              ) : null}
            </div>
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? uk.saving : uk.save}</button>
          </form>
        </Sheet>
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title={uk.admin.deleteExercise}
          body={formError || fill(uk.admin.deleteExerciseConfirm, { name: deleteTarget.name })}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => {
            setDeleteTarget(null);
            setFormError("");
          }}
          onConfirm={() => void deleteExercise()}
        />
      ) : null}
    </div>
  );
}
