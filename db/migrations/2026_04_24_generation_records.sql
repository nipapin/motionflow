-- Persisted AI generation history (prompts, settings, outputs, status).
-- Quota remains on `user_generations`; this table is for UI history only.

CREATE TABLE IF NOT EXISTS `generation_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `tool` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `settings` JSON NOT NULL,
  `result` JSON NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_user_tool` (`user_id`, `tool`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
