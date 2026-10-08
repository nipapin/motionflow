-- Apply explicitly before using the PremiereGal course script's apply/send commands.
-- Durable grant journal and mail outbox. No FK: preserve history after user deletion.
CREATE TABLE IF NOT EXISTS `premieregal_course_grants` (
  `campaign` VARCHAR(100) NOT NULL,
  `account_email` VARCHAR(255) NOT NULL,
  `contact_email` VARCHAR(255) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `created_user` TINYINT NOT NULL,
  `first_name` VARCHAR(255) NOT NULL,
  `last_name` VARCHAR(255) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `subscription_id` VARCHAR(64) NULL,
  `base_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `applied_at` DATETIME NOT NULL,
  `mail_status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `mail_payload` JSON NULL,
  `mail_started_at` DATETIME NULL,
  `mail_sent_at` DATETIME NULL,
  `mail_provider_id` VARCHAR(255) NULL,
  PRIMARY KEY (`campaign`, `account_email`),
  UNIQUE KEY `campaign_user` (`campaign`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
