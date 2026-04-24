-- Idempotent application of extra AI generation credits from Paddle `transaction.completed`
-- webhooks (one row per Paddle transaction id; prevents double-credit on retries).

CREATE TABLE IF NOT EXISTS `paddle_extra_generation_credit_events` (
  `paddle_transaction_id` VARCHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `generations` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`paddle_transaction_id`),
  KEY `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
