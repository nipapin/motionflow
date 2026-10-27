-- Replicate prediction metadata and resumable admin history sync. All dates are UTC.
CREATE TABLE IF NOT EXISTS ai_usage_predictions (
      prediction_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      account_key VARCHAR(32) NOT NULL DEFAULT 'unknown',
      model VARCHAR(255) NOT NULL, status VARCHAR(16) NOT NULL,
      created_at DATETIME(3) NOT NULL, completed_at DATETIME(3) NULL,
      predict_seconds DOUBLE NULL, total_seconds DOUBLE NULL,
      input_tokens BIGINT UNSIGNED NULL, output_tokens BIGINT UNSIGNED NULL,
      user_ref VARCHAR(191) NULL, client VARCHAR(64) NULL,
      observed_at DATETIME(3) NOT NULL,
      KEY idx_created (created_at, prediction_id), KEY idx_account_created (account_key, created_at),
      KEY idx_model_created (model, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage_sync_ranges (
      range_key CHAR(64) CHARACTER SET ascii PRIMARY KEY,
      next_cursor TEXT NULL, complete TINYINT NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NULL, lease_until DATETIME(3) NULL, lease_owner CHAR(36) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
