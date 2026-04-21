-- One-time cleanup: temporary replicate.delivery URLs expire (~1h). Old rows still
-- pointing at them cannot be recovered; mark as failed and drop broken result JSON
-- so the app does not load 404s. Prompt/settings stay in `settings`.
--
-- Apply manually or via your migration runner after backup if needed:
--   mysql ... < db/migrations/2026_04_21_invalidate_expired_replicate_delivery_records.sql

UPDATE `generation_records`
SET
  `status` = 'failed',
  `result` = NULL,
  `error_message` = 'Output link expired (temporary Replicate CDN). Regenerate to save a persistent copy.'
WHERE `status` = 'ok'
  AND `result` IS NOT NULL
  AND CAST(`result` AS CHAR) LIKE '%replicate.delivery%';
