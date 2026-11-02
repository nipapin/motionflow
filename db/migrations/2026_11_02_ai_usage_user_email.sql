-- Preserve the authenticated user's email with prediction metadata.
-- Runtime also ensures this column for existing installations.
SET @ai_usage_email_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ai_usage_predictions'
      AND column_name = 'user_email'),
  'SELECT 1',
  'ALTER TABLE ai_usage_predictions ADD COLUMN user_email VARCHAR(255) NULL AFTER user_ref'
);
PREPARE ai_usage_email_stmt FROM @ai_usage_email_sql;
EXECUTE ai_usage_email_stmt;
DEALLOCATE PREPARE ai_usage_email_stmt;
