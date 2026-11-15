CREATE TABLE IF NOT EXISTS cep_apply_reports (
  report_id CHAR(36) NOT NULL PRIMARY KEY,
  installation_id CHAR(36) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  reported_email VARCHAR(191) NULL,
  item_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  extension_version VARCHAR(64) NOT NULL,
  host_version VARCHAR(64) NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  missing_count INT UNSIGNED NOT NULL DEFAULT 0,
  payload JSON NOT NULL,
  KEY idx_cep_apply_received (received_at, report_id),
  KEY idx_cep_apply_status (status, received_at),
  KEY idx_cep_apply_email (reported_email, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
