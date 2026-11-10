export function bytes(n?: number | null, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function duration(seconds?: number | null): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function dateTime(value?: Date | number | string | null): string {
  if (value === undefined || value === null) return "—";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" });
}

export function percent(v?: number | null): string {
  if (v === undefined || v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
