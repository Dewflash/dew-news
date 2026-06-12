-- Seed source from SPEC.md Section 4.2.
--
-- Run this AFTER logging in to the app at least once — it depends on the
-- `users` row for dewlearns@gmail.com, which is created automatically by the
-- NextAuth signIn callback on first login.

INSERT INTO sources (user_id, name, sender_email, provider, is_active, fetch_priority, notes)
VALUES (
  (SELECT id FROM users WHERE email = 'dewlearns@gmail.com'),
  'Reuters Newsletter',
  '%@thomsonreuters.com',  -- wildcard: matches all @thomsonreuters.com senders
  'gmail',
  TRUE,
  1,
  'Primary news source — Thomson Reuters'
);
