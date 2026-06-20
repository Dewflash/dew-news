import type { SourcesRow } from "@/types/database";

/** Matches an email's From header against the active sources (Section 4.2's domain-wildcard / exact-address patterns). */
export function matchSource(fromHeader: string | null, sources: SourcesRow[]): SourcesRow | null {
  if (!fromHeader) return null;
  const emailMatch = fromHeader.match(/<([^>]+)>/);
  const senderEmail = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim();

  for (const source of sources) {
    if (source.sender_email.startsWith("%@")) {
      const domain = source.sender_email.slice(2).toLowerCase();
      if (senderEmail.endsWith(`@${domain}`)) return source;
    } else if (source.sender_email.toLowerCase() === senderEmail) {
      return source;
    }
  }
  return null;
}
