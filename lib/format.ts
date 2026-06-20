/** Section 7.7 display format: under 60s = "< 1 min read", else rounded up minutes. */
export function formatReadingTime(seconds: number): string {
  if (seconds < 60) return "< 1 min read";
  return `${Math.ceil(seconds / 60)} min read`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Best-effort human-readable preview for the common "M H * * *" / "M H * * D" cron shapes used by this app. */
export function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, , , dayOfWeek] = parts;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return expr;
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (dayOfWeek === "*") return `Every day at ${time}`;
  if (/^\d+$/.test(dayOfWeek)) return `Every ${DAY_NAMES[Number(dayOfWeek) % 7]} at ${time}`;
  return expr;
}
