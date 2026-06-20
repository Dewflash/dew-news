/**
 * One-time local bootstrap for Section 8.1's gmail.readonly offline grant.
 *
 * NextAuth's login flow already requests this scope (see auth.ts) but never
 * persists account.refresh_token anywhere — and the fetch pipeline runs
 * unattended (cron / server action), so it needs its own long-lived refresh
 * token rather than relying on a browser session. Run this once, paste the
 * printed refresh token into GOOGLE_REFRESH_TOKEN in .env.local and on
 * Vercel, then it's done — Google only issues a refresh token on first
 * consent (or after revoking access), so don't re-run this casually.
 *
 * Usage: npm run gmail:auth
 * Requires http://localhost:53682/oauth/callback to be added as an
 * Authorized redirect URI on the existing Google OAuth client first.
 */
import { createServer } from "node:http";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET must be set (e.g. via --env-file=.env.local).");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });

  console.log("\nOpen this URL, sign in as dewlearns@gmail.com, and approve access:\n");
  console.log(authUrl, "\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", REDIRECT_URI);
      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(error ? `Error: ${error}. You can close this tab.` : "Success — you can close this tab.");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code or error in callback"));
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh_token returned. Google only issues one on first consent — " +
        "revoke prior access at https://myaccount.google.com/permissions and re-run this script."
    );
    process.exit(1);
  }

  console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
  console.log("\nAdd this to .env.local and to the Vercel project's environment variables.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
