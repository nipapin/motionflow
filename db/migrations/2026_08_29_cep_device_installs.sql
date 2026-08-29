-- CEP device installed-pack snapshots (panel reports full list on disk).
-- Also lazily created from lib/cep-device-installs.ts.

CREATE TABLE IF NOT EXISTS `cep_device_installs` (
  `device_id` BIGINT UNSIGNED NOT NULL,
  `pack_id` BIGINT UNSIGNED NOT NULL,
  `version` VARCHAR(64) NULL,
  `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`device_id`, `pack_id`),
  KEY `idx_cep_device_installs_pack` (`pack_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
