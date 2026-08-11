-- CEP client environment telemetry: which host app versions / OS users open the panel from.
-- Used to decide when to drop CC2023 (and older) support.
-- Table is also lazily created from lib/cep-client-sessions.ts (same DDL).

CREATE TABLE IF NOT EXISTS `cep_client_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `device_id` BIGINT UNSIGNED NULL,
  `client` VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
  `host_app_id` VARCHAR(16) NOT NULL,
  `host_app_name` VARCHAR(64) NULL,
  `host_version` VARCHAR(64) NOT NULL,
  `os` VARCHAR(255) NOT NULL,
  `extension_version` VARCHAR(64) NOT NULL,
  `locale` VARCHAR(32) NULL,
  `ip` VARCHAR(45) NULL,
  `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cep_client_sessions_user` (`user_id`),
  KEY `idx_cep_client_sessions_host` (`host_app_id`, `host_version`),
  KEY `idx_cep_client_sessions_os` (`os`(64)),
  KEY `idx_cep_client_sessions_reported` (`reported_at`),
  KEY `idx_cep_client_sessions_dedupe` (`user_id`, `device_id`, `host_app_id`, `host_version`, `extension_version`, `reported_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
