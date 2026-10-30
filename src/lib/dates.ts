function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return formatISODate(new Date());
}

export function isISODate(value: string | null | undefined): value is string {
  if (!value || !/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

export function startOfMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return formatISODate(new Date(year, month - 1, 1));
}

export function previousMonthRange(iso: string): { from: string; to: string } {
  const [year, month] = iso.split("-").map(Number);
  return {
    from: formatISODate(new Date(year, month - 2, 1)),
    to: formatISODate(new Date(year, month - 1, 0)),
  };
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function formatChartDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(date);
}
