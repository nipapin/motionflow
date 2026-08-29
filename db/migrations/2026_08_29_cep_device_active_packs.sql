-- Packs currently open / in use on a CEP device (panel heartbeat).
-- Also lazily created from lib/cep-device-active-packs.ts.

CREATE TABLE IF NOT EXISTS `cep_device_active_packs` (
  `device_id` BIGINT UNSIGNED NOT NULL,
  `pack_id` BIGINT UNSIGNED NOT NULL,
  `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`device_id`, `pack_id`),
  KEY `idx_cep_device_active_packs_pack` (`pack_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
