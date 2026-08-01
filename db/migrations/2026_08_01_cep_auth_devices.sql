-- CEP (Adobe extension) device-code auth: long-lived Bearer tokens per device.
-- - cep_devices: one row per signed-in CEP install; token stored as SHA-256 hash.
-- - cep_auth_sessions: short-lived device-code login sessions (panel polls by code).
-- Tables are also lazily created from lib/cep-auth.ts (same DDL).

CREATE TABLE IF NOT EXISTS `cep_devices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `user_fingerprint` TEXT NULL,
  `name` VARCHAR(191) NULL,
  `ip` VARCHAR(45) NULL,
  `client` VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME NULL,
  `revoked_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cep_devices_token_hash` (`token_hash`),
  KEY `idx_cep_devices_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cep_auth_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(16) NOT NULL,
  -- pending | complete | denied | expired
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `usp` TEXT NULL,
  `device_json` TEXT NULL,
  `client` VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
  `ip` VARCHAR(45) NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `device_id` BIGINT UNSIGNED NULL,
  -- SHA-256 of panel-only device_code (required to claim the Bearer token)
  `device_code_hash` CHAR(64) NULL,
  -- Bearer token held only until the panel claims it via POST /api/cep/auth/token.
  `token_plain` VARCHAR(128) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `claimed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cep_auth_sessions_code` (`code`),
  KEY `idx_cep_auth_sessions_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
