import { defaultProgression, type ProgressionSettings } from "./progression.ts";
import { isHalfStep } from "./numbers.ts";

const storageKey = "workout.progression";

export function loadProgressionSettings(): ProgressionSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultProgression };
    const parsed = JSON.parse(raw) as Partial<ProgressionSettings>;
    const repMin = Number(parsed.repMin);
    const repMax = Number(parsed.repMax);
    const weightStep = Number(parsed.weightStep);
    if (!Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax > 30 || repMin >= repMax) {
      return { ...defaultProgression };
    }
    if (!Number.isFinite(weightStep) || weightStep <= 0 || weightStep > 50 || !isHalfStep(weightStep)) {
      return { ...defaultProgression };
    }
    return { repMin, repMax, weightStep };
  } catch {
    return { ...defaultProgression };
  }
}

export function saveProgressionSettings(settings: ProgressionSettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}
