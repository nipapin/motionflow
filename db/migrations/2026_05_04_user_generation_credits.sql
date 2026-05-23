-- Single source of truth for manually controllable AI generation credits (Creator + AI).
-- - extra_balance: mirrors spendable extras (also kept in sync on users.extra_generations_count).
-- - subscription_adjustment: extra monthly allowance for one billing period (disputes / goodwill).

CREATE TABLE IF NOT EXISTS `user_generation_credits` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `extra_balance` INT NOT NULL DEFAULT 0,
  `subscription_adjustment` INT NOT NULL DEFAULT 0,
  `subscription_adjustment_period_start` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_generation_credit_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `payload` JSON NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill extra balances from users (existing rows left unchanged).
INSERT INTO `user_generation_credits` (`user_id`, `extra_balance`)
SELECT u.`id`, IFNULL(u.`extra_generations_count`, 0)
FROM `users` u
LEFT JOIN `user_generation_credits` c ON c.`user_id` = u.`id`
WHERE c.`user_id` IS NULL;
