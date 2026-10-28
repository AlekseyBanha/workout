export function parseDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-6;
}

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function formatWeight(value: number): string {
  const rounded = roundToHalf(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1).replace(".", ",");
}

export function formatKb(bytes: number): string {
  return (bytes / 1024).toFixed(0);
}
