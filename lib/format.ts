/** Section 7.7 display format: under 60s = "< 1 min read", else rounded up minutes. */
export function formatReadingTime(seconds: number): string {
  if (seconds < 60) return "< 1 min read";
  return `${Math.ceil(seconds / 60)} min read`;
}
