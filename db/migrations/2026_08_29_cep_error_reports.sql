-- CEP error reports persisted for Extensions Users admin dashboard.
-- Also lazily created from lib/cep-error-reports.ts.
-- Telegram still receives severity=error via /api/cep/support/report.

CREATE TABLE IF NOT EXISTS `cep_error_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `device_id` BIGINT UNSIGNED NULL,
  `client` VARCHAR(64) NOT NULL,
  `action` VARCHAR(200) NOT NULL,
  `error` TEXT NOT NULL,
  `error_code` VARCHAR(128) NULL,
  `severity` VARCHAR(16) NOT NULL DEFAULT 'error',
  `stack` TEXT NULL,
  `extension_version` VARCHAR(64) NULL,
  `host_app_id` VARCHAR(64) NULL,
  `host_app_name` VARCHAR(64) NULL,
  `host_version` VARCHAR(64) NULL,
  `os` VARCHAR(500) NULL,
  `locale` VARCHAR(32) NULL,
  `extra` JSON NULL,
  `occurred_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cep_error_reports_device` (`device_id`, `occurred_at`),
  KEY `idx_cep_error_reports_user` (`user_id`, `occurred_at`),
  KEY `idx_cep_error_reports_client` (`client`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
