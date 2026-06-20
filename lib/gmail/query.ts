import type { SourcesRow } from "@/types/database";

/**
 * Builds the Gmail search query per Section 8.2: a rolling 24h window (not a
 * calendar day, so non-SGT newsletters never fall through a timezone gap)
 * and a `from:()` clause built from active sources. A `sender_email`
 * starting with `%@` is a domain wildcard (Section 4.2) — strip the `%` so
 * Gmail matches the whole domain.
 */
export function buildSearchQuery(sources: SourcesRow[]): string {
  const senders = sources
    .filter((s) => s.is_active)
    .map((s) => (s.sender_email.startsWith("%@") ? s.sender_email.slice(1) : s.sender_email));

  const afterTimestamp = Math.floor((Date.now() - 86_400_000) / 1000);
  return `from:(${senders.join(" OR ")}) after:${afterTimestamp}`;
}
