-- Append-only activity; download rows advance from requested to issued/failed.
-- Dates follow the existing database wall clock (NOW), not browser local time.
CREATE TABLE IF NOT EXISTS `user_activity` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(24) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `resource_type` VARCHAR(32) NOT NULL,
  `resource_id` VARCHAR(191) NULL,
  `resource_name` VARCHAR(255) NULL,
  `source` VARCHAR(16) NOT NULL,
  `device_id` BIGINT UNSIGNED NULL,
  `status` VARCHAR(24) NOT NULL,
  `details` JSON NOT NULL,
  `legacy_download_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activity_download` (`legacy_download_id`),
  KEY `idx_activity_user_date` (`user_id`, `created_at`, `id`),
  KEY `idx_activity_user_category_date` (`user_id`, `category`, `created_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
