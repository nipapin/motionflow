-- Persist the absolute target BEFORE calling Paddle. Retrying never adds another year.
CREATE TABLE IF NOT EXISTS `premieregal_course_billing` (
  `campaign` VARCHAR(100) NOT NULL,
  `subscription_id` VARCHAR(64) NOT NULL,
  `buyer_id` BIGINT UNSIGNED NOT NULL,
  `environment` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `previous_next_billed_at` VARCHAR(40) NOT NULL,
  `target_next_billed_at` VARCHAR(40) NOT NULL,
  `snapshot` JSON NOT NULL,
  `prepared_at` DATETIME NOT NULL,
  `applied_at` DATETIME NULL,
  PRIMARY KEY (`campaign`, `subscription_id`),
  KEY `campaign_buyer` (`campaign`, `buyer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
