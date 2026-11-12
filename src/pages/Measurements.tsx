import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, ExerciseThumb, Field, Loading, fieldClass, primaryButton, useTitle } from "../components/ui.tsx";
import { fill, uk } from "../i18n/uk.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatChartDate, formatDate, isISODate, todayISO } from "../lib/dates.ts";
import { formatMeasure, isTenthStep, parseDecimal } from "../lib/numbers.ts";
import { measurementImageUrl, supabase } from "../lib/supabase.ts";
import { asBodyEntry, asList, asMeasurement, type BodyEntry, type Measurement } from "../lib/types.ts";

const MeasurementChart = lazy(() => import("../components/MeasurementChart.tsx"));

function signedDelta(current: number, previous: number, unit: string): string {
  const delta = Math.round((current - previous) * 10) / 10;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${formatMeasure(Math.abs(delta))} ${unit}`;
}

export function MeasurementsPage() {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<Measurement[]>([]);
  const [history, setHistory] = useState<BodyEntry[]>([]);
  const [date, setDate] = useState(todayISO());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  useTitle(uk.measurements.title);

  useEffect(() => {
    if (!supabase || !profile) return;
    let active = true;
    setPhase("loading");
    Promise.all([
      supabase.from("measurements").select("id, name, unit, hint, image_path, sort_order, created_at").order("sort_order").order("name"),
      supabase
        .from("body_entries")
        .select("id, user_id, measurement_id, measured_at, value, created_at")
        .eq("user_id", profile.id)
        .order("measured_at"),
    ]).then(([catalogRes, historyRes]) => {
      if (!active) return;
      if (catalogRes.error || historyRes.error) {
        setPhase("error");
        return;
      }
      const items = asList(catalogRes.data, asMeasurement);
      const entries = asList(historyRes.data, asBodyEntry);
      setCatalog(items);
      setHistory(entries);
      setSelectedId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      setPhase("ready");
    });
    return () => {
      active = false;
    };
  }, [profile, reload]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of catalog) {
      const row = history.find((entry) => entry.measurement_id === item.id && entry.measured_at === date);
      next[item.id] = row ? formatMeasure(row.value) : "";
    }
    setDrafts(next);
    setSaved(false);
    setFormError("");
  }, [catalog, date, history]);

  const selected = catalog.find((item) => item.id === selectedId) ?? null;
  const selectedHistory = useMemo(() => {
    if (!selected) return [];
    return history
      .filter((entry) => entry.measurement_id === selected.id)
      .slice()
      .sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1));
  }, [history, selected]);

  const points = useMemo(
    () => selectedHistory.map((entry) => ({ date: entry.measured_at, label: formatChartDate(entry.measured_at), value: entry.value })),
    [selectedHistory],
  );

  function previousOf(measurementId: string): BodyEntry | null {
    const earlier = history.filter((entry) => entry.measurement_id === measurementId && entry.measured_at < date);
    return earlier.length ? earlier[earlier.length - 1] : null;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !profile) return;
    setSaved(false);
    const parsed: Array<{ measurement: Measurement; value: number }> = [];
    for (const item of catalog) {
      const raw = drafts[item.id]?.trim() ?? "";
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (value === null || value <= 0 || value > 400 || !isTenthStep(value)) {
        setFormError(uk.measurements.valueError);
        return;
      }
      parsed.push({ measurement: item, value });
    }
    const cleared = catalog.filter((item) => {
      const raw = drafts[item.id]?.trim() ?? "";
      const existed = history.some((entry) => entry.measurement_id === item.id && entry.measured_at === date);
      return !raw && existed;
    });
    if (parsed.length === 0 && cleared.length === 0) {
      setFormError(uk.measurements.nothing);
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      if (parsed.length > 0) {
        const { error } = await supabase.from("body_entries").upsert(
          parsed.map((row) => ({
            user_id: profile.id,
            measurement_id: row.measurement.id,
            measured_at: date,
            value: row.value,
          })),
          { onConflict: "user_id,measurement_id,measured_at" },
        );
        if (error) throw error;
      }
      if (cleared.length > 0) {
        const { error } = await supabase
          .from("body_entries")
          .delete()
          .eq("user_id", profile.id)
          .eq("measured_at", date)
          .in(
            "measurement_id",
            cleared.map((item) => item.id),
          );
        if (error) throw error;
      }
      setSaved(true);
      setReload((value) => value + 1);
    } catch {
      setFormError(uk.workout.saveError);
    } finally {
      setBusy(false);
    }
  }

  const first = selectedHistory[0];
  const last = selectedHistory[selectedHistory.length - 1];
  const prior = selectedHistory.length > 1 ? selectedHistory[selectedHistory.length - 2] : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{uk.measurements.title}</h1>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.measurements.error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && catalog.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line px-4 py-10 text-center">
          <p className="text-lg font-semibold">{uk.measurements.empty}</p>
          <p className="mt-2 text-sm text-muted">{uk.measurements.emptyHint}</p>
        </div>
      ) : null}
      {phase === "ready" && catalog.length > 0 && selected ? (
        <>
          <section className="rounded-3xl border border-line bg-panel p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {catalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${item.id === selected.id ? "bg-lime text-ink" : "bg-ink text-muted"}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <h2 className="font-medium">{uk.measurements.chart}</h2>
            {points.length === 0 ? <p className="mt-3 text-sm text-muted">{uk.measurements.noChart}</p> : null}
            {points.length === 1 ? <p className="mt-3 text-sm text-muted">{uk.measurements.onePoint}</p> : null}
            {points.length >= 2 && last && prior && first ? (
              <div className="mt-2 space-y-1 text-sm text-muted">
                <p>{fill(uk.measurements.latest, { date: formatDate(last.measured_at) })} · {formatMeasure(last.value)} {selected.unit}</p>
                <p>{fill(uk.measurements.sincePrevious, { delta: signedDelta(last.value, prior.value, selected.unit) })}</p>
                <p>{fill(uk.measurements.sinceFirst, { delta: signedDelta(last.value, first.value, selected.unit) })}</p>
              </div>
            ) : null}
            {points.length > 0 ? (
              <Suspense fallback={<div className="h-52" />}>
                <MeasurementChart points={points} unit={selected.unit} name={selected.name} />
              </Suspense>
            ) : null}
          </section>
          <form className="space-y-3" noValidate onSubmit={(event) => void save(event)}>
            <Field label={uk.measurements.date}>
              <input
                className={fieldClass}
                type="date"
                max={todayISO()}
                value={date}
                onChange={(event) => {
                  if (isISODate(event.target.value)) setDate(event.target.value);
                }}
              />
            </Field>
            {catalog.map((item) => {
              const previous = previousOf(item.id);
              return (
                <div key={item.id} className="flex gap-3 rounded-3xl border border-line bg-panel p-3">
                  <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                    <ExerciseThumb src={measurementImageUrl(item.image_path)} alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    {item.hint ? <p className="mt-0.5 text-xs text-muted">{item.hint}</p> : null}
                    <p className="mt-1 text-xs text-muted">
                      {previous
                        ? `${uk.measurements.previous}: ${formatMeasure(previous.value)} ${item.unit} · ${formatDate(previous.measured_at)}`
                        : uk.measurements.noPrevious}
                    </p>
                    <label className="mt-2 flex items-center gap-2">
                      <span className="sr-only">{item.name}</span>
                      <input
                        className={`${fieldClass} h-11`}
                        inputMode="decimal"
                        value={drafts[item.id] ?? ""}
                        placeholder={item.unit}
                        onChange={(event) => {
                          setSaved(false);
                          setDrafts((current) => ({ ...current, [item.id]: event.target.value }));
                        }}
                      />
                      <span className="w-8 shrink-0 text-sm text-muted">{item.unit}</span>
                    </label>
                  </div>
                </div>
              );
            })}
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            {saved && !formError ? <p className="text-sm text-lime">{uk.measurements.saved}</p> : null}
            <button type="submit" className={primaryButton} disabled={busy}>
              {busy ? uk.saving : uk.measurements.save}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
