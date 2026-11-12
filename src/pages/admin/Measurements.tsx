import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { fill, uk } from "../../i18n/uk.ts";
import { compressExerciseImage, type CompressedImage } from "../../lib/image.ts";
import { formatKb } from "../../lib/numbers.ts";
import { measurementImageUrl, supabase } from "../../lib/supabase.ts";
import { asList, asMeasurement, type Measurement } from "../../lib/types.ts";
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

const measurementSchema = z.object({
  name: z.string().trim().min(1, uk.errors.exerciseName).max(80),
  unit: z.enum(["см", "кг"]),
  hint: z.string().trim().max(500),
  sort_order: z.number().int().min(0).max(999),
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

export function AdminMeasurementsPage() {
  const [items, setItems] = useState<Measurement[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Measurement | "new" | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"см" | "кг">("см");
  const [hint, setHint] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Measurement | null>(null);
  useTitle(uk.admin.measurements);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("measurements")
      .select("id, name, unit, hint, image_path, sort_order, created_at")
      .order("sort_order")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPhase("error");
          return;
        }
        setItems(asList(data, asMeasurement));
        setPhase("ready");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  function openCreate() {
    if (photo) URL.revokeObjectURL(photo.url);
    const next = items.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;
    setEditing("new");
    setName("");
    setUnit("см");
    setHint("");
    setSortOrder(String(next));
    setPhoto(null);
    setRemovePhoto(false);
    setFieldError({});
    setFormError("");
  }

  function openEdit(item: Measurement) {
    if (photo) URL.revokeObjectURL(photo.url);
    setEditing(item);
    setName(item.name);
    setUnit(item.unit);
    setHint(item.hint ?? "");
    setSortOrder(String(item.sort_order));
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

  async function uploadPhoto(measurementId: string, draft: PhotoDraft): Promise<string> {
    if (!supabase) throw new Error("config");
    const path = `${measurementId}/${crypto.randomUUID()}.${draft.ext}`;
    const { error } = await supabase.storage.from("measurement-images").upload(path, draft.blob, {
      contentType: draft.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async function removeStoredPhoto(path: string | null) {
    if (!path || !supabase) return;
    const { error } = await supabase.storage.from("measurement-images").remove([path]);
    if (error) throw error;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !editing) return;
    const order = Number(sortOrder.trim());
    const parsed = measurementSchema.safeParse({
      name,
      unit,
      hint,
      sort_order: order,
    });
    if (!parsed.success) {
      setFieldError(issues(parsed.error));
      return;
    }
    setFieldError({});
    setBusy(true);
    setFormError("");
    const payload = {
      name: parsed.data.name,
      unit: parsed.data.unit,
      hint: parsed.data.hint || null,
      sort_order: parsed.data.sort_order,
    };

    try {
      if (editing === "new") {
        const { data, error } = await supabase
          .from("measurements")
          .insert(payload)
          .select("id, name, unit, hint, image_path, sort_order, created_at")
          .single();
        if (error) throw error;
        const created = asMeasurement(data);
        if (!created) throw new Error("save");
        if (photo) {
          const path = await uploadPhoto(created.id, photo);
          const { error: updateError } = await supabase.from("measurements").update({ image_path: path }).eq("id", created.id);
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
        const { error } = await supabase.from("measurements").update({ ...payload, image_path: imagePath }).eq("id", editing.id);
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

  async function deleteMeasurement() {
    if (!supabase || !deleteTarget) return;
    setBusy(true);
    setFormError("");
    const { count, error: countError } = await supabase
      .from("body_entries")
      .select("id", { count: "exact", head: true })
      .eq("measurement_id", deleteTarget.id);
    if (countError) {
      setBusy(false);
      setFormError(uk.workout.saveError);
      return;
    }
    if ((count ?? 0) > 0) {
      setBusy(false);
      setFormError(uk.admin.hasEntries);
      return;
    }
    const { error } = await supabase.from("measurements").delete().eq("id", deleteTarget.id);
    if (error) {
      setBusy(false);
      setFormError(uk.admin.hasEntries);
      return;
    }
    if (deleteTarget.image_path) {
      await supabase.storage.from("measurement-images").remove([deleteTarget.image_path]);
    }
    setBusy(false);
    setDeleteTarget(null);
    setEditing(null);
    setReload((value) => value + 1);
  }

  const currentImage = editing && editing !== "new" ? measurementImageUrl(editing.image_path) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{uk.admin.measurements}</h1>
        <button type="button" className={`${primaryButton} w-auto px-4`} onClick={openCreate}>
          {uk.admin.createMeasurement}
        </button>
      </div>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.admin.measurementsError} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && items.length === 0 ? <EmptyState title={uk.admin.measurementsEmpty} /> : null}
      {phase === "ready" && items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-3xl border border-line bg-panel p-3">
              <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                <ExerciseThumb src={measurementImageUrl(item.image_path)} alt="" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block text-sm text-muted">{item.unit} · {item.sort_order}</span>
                <span className="mt-2 flex gap-2">
                  <button type="button" className={chipButton} onClick={() => openEdit(item)}>{uk.edit}</button>
                  <button type="button" className={chipDanger} onClick={() => { setFormError(""); setDeleteTarget(item); }}>{uk.delete}</button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {formError && !editing ? <p className="text-sm text-danger">{formError}</p> : null}
      {editing ? (
        <Sheet title={editing === "new" ? uk.admin.createMeasurement : uk.admin.editMeasurement} onClose={() => setEditing(null)}>
          <form className="space-y-3" noValidate onSubmit={(event) => void save(event)}>
            <Field label={uk.admin.measurementName} error={fieldError.name}>
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={uk.admin.unit} error={fieldError.unit}>
              <select className={fieldClass} value={unit} onChange={(event) => setUnit(event.target.value === "кг" ? "кг" : "см")}>
                <option value="см">см</option>
                <option value="кг">кг</option>
              </select>
            </Field>
            <Field label={uk.admin.hint}>
              <textarea className={`${fieldClass} h-28 py-3`} value={hint} onChange={(event) => setHint(event.target.value)} />
            </Field>
            <Field label={uk.admin.sortOrder} error={fieldError.sort_order}>
              <input className={fieldClass} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
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
          body={formError || fill(uk.admin.deleteMeasurementConfirm, { name: deleteTarget.name })}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => {
            setDeleteTarget(null);
            setFormError("");
          }}
          onConfirm={() => void deleteMeasurement()}
        />
      ) : null}
    </div>
  );
}
