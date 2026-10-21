-- Additive only: no historical financial rows are read, backfilled or updated.
-- Apply before deploying either app. Activation is a separate, explicit command.
CREATE TABLE IF NOT EXISTS paddle_accounting_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled_from DATETIME(6) NULL,
  accept_new TINYINT UNSIGNED NOT NULL DEFAULT 0,
  worker_heartbeat_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
INSERT IGNORE INTO paddle_accounting_settings (id, enabled_from) VALUES (1, NULL);

CREATE TABLE IF NOT EXISTS paddle_accounting_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account VARCHAR(16) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  subscription_id VARCHAR(64) NULL,
  buyer_id BIGINT UNSIGNED NULL,
  version SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reason VARCHAR(255) NULL,
  currency_code VARCHAR(8) NULL,
  payout_currency_code VARCHAR(8) NULL,
  fee_minor BIGINT NULL,
  earnings_minor BIGINT NULL,
  paddle_created_at DATETIME(6) NOT NULL,
  participants JSON NOT NULL,
  scope_snapshot JSON NOT NULL,
  source_payload JSON NOT NULL,
  completed_payload JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_paddle_accounting_transaction (account, environment, transaction_id),
  KEY idx_paddle_accounting_pending (status, updated_at),
  KEY idx_paddle_accounting_subscription (subscription_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paddle_accounting_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_row_id BIGINT UNSIGNED NOT NULL,
  line_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NULL,
  legacy_payment_id VARCHAR(191) NOT NULL,
  rule_snapshot JSON NOT NULL,
  breakdown JSON NOT NULL,
  revenue_minor BIGINT NOT NULL,
  fee_minor BIGINT NOT NULL,
  original_net_minor BIGINT NOT NULL,
  current_net_minor BIGINT NOT NULL,
  retained_fee_minor BIGINT NOT NULL DEFAULT 0,
  sold_item_id BIGINT UNSIGNED NULL,
  subscription_payment_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_paddle_accounting_line (transaction_row_id, line_id),
  KEY idx_paddle_accounting_author (author_id, created_at),
  KEY idx_paddle_accounting_legacy (legacy_payment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paddle_accounting_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account VARCHAR(16) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  adjustment_id VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  reason VARCHAR(255) NULL,
  source_payload JSON NOT NULL,
  applied_payload JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_paddle_accounting_adjustment (account, environment, adjustment_id),
  KEY idx_paddle_accounting_adjustment_pending (status, updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paddle_accounting_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_key CHAR(64) NOT NULL,
  line_row_id BIGINT UNSIGNED NOT NULL,
  adjustment_id VARCHAR(64) NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(24) NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency_code VARCHAR(8) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_paddle_accounting_movement (entry_key),
  KEY idx_paddle_accounting_movement_author (user_id, created_at)
) ENGINE=InnoDB;
