import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

/**
 * Server-side Gmail client authenticated via a long-lived refresh token
 * (Section 8.1 — requires the gmail.readonly scope, granted during the
 * NextAuth Google sign-in). The refresh token is bootstrapped once via
 * scripts/get-gmail-refresh-token.ts and stored as GOOGLE_REFRESH_TOKEN —
 * NextAuth's own session/JWT is not usable here since the fetch pipeline
 * runs unattended (cron, or a server action with no browser session tied
 * to Google's offline grant).
 */
function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

export function getGmailClient(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getOAuthClient() });
}

export interface GmailMessageMeta {
  id: string;
}

/** Returns the message ids matching `query` (Section 8.2's `from:(...) after:...` query). */
export async function searchMessages(gmail: gmail_v1.Gmail, query: string): Promise<GmailMessageMeta[]> {
  const messages: GmailMessageMeta[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: query,
      pageToken,
    });
    for (const m of data.messages ?? []) {
      if (m.id) messages.push({ id: m.id });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return messages;
}

/** Fetches one message in full (Section 8.3 step 1). */
export async function getMessage(gmail: gmail_v1.Gmail, id: string): Promise<gmail_v1.Schema$Message> {
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  return data;
}
