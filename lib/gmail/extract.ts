import type { gmail_v1 } from "googleapis";

export interface ExtractedEmail {
  subject: string | null;
  emailDate: string | null;
  body: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/** Depth-first search for the first part of the given mime type, including the top-level payload itself. */
function findPart(payload: gmail_v1.Schema$MessagePart | undefined, mimeType: string): gmail_v1.Schema$MessagePart | null {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Common unsubscribe/legal-footer patterns — strips everything from the first match onward. */
const FOOTER_PATTERNS = [
  /unsubscribe/i,
  /you('| a)re receiving this (email|newsletter)/i,
  /view (this email|in your browser)/i,
  /all rights reserved/i,
  /©\s*\d{4}/,
  /manage your (email )?preferences/i,
];

function stripFooter(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (FOOTER_PATTERNS.some((p) => p.test(lines[i]))) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  return text.trim();
}

function getHeader(message: gmail_v1.Schema$Message, name: string): string | null {
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** Section 8.3: extract plain text (preferred) or HTML (stripped/cleaned), with footers removed. */
export function extractEmailBody(message: gmail_v1.Schema$Message): ExtractedEmail {
  const subject = getHeader(message, "Subject");
  const emailDate = getHeader(message, "Date");

  const plainPart = findPart(message.payload, "text/plain");
  if (plainPart?.body?.data) {
    return { subject, emailDate, body: stripFooter(decodeBase64Url(plainPart.body.data)) };
  }

  const htmlPart = findPart(message.payload, "text/html");
  if (htmlPart?.body?.data) {
    return { subject, emailDate, body: stripFooter(stripHtml(decodeBase64Url(htmlPart.body.data))) };
  }

  return { subject, emailDate, body: "" };
}
