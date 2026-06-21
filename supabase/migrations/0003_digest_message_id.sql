-- Adds Gmail message id tracking to digests, so a fetch run (manual or cron)
-- can skip emails already turned into a digest instead of re-processing them
-- on every run within the same rolling 24h search window.

ALTER TABLE digests ADD COLUMN gmail_message_id TEXT;

CREATE UNIQUE INDEX digests_user_gmail_message_id_idx
  ON digests (user_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;
