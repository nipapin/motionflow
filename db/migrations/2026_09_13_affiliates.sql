-- Motion Flow subscription affiliates (admin "Partners" / partner "Affiliate").
--
-- Separate from the marketplace author affiliate (`sold_items.ref_author_id` /
-- `ref_link_id` + `short_links`) — that one pays authors for referring item
-- sales and stays untouched. These tables pay external partners a percentage of
-- the net amount (gross − Paddle fee) of Motion Flow Creator / Creator + AI
-- subscription payments.
--
-- Runtime also ensures this schema via `lib/affiliate/db.ts`.
-- Manual run: node --env-file=.env scripts/apply-affiliates-migration.mjs

CREATE TABLE IF NOT EXISTS `affiliates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL COMMENT 'NULL until the invited partner accepts and we link the account',
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `social_url` VARCHAR(512) NULL,
  `slug` VARCHAR(32) NOT NULL COMMENT 'motionflow.pro/?ref={slug}, [a-z0-9-]{3,32}',
  `commission_percent` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  `recurring_mode` ENUM('first_only','all') NOT NULL DEFAULT 'all',
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `payoneer_email` VARCHAR(255) NULL COMMENT 'Set by the partner in their own cabinet',
  `invite_token_sent_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_affiliates_email` (`email`),
  UNIQUE KEY `uq_affiliates_slug` (`slug`),
  KEY `idx_affiliates_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `affiliate_commissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `affiliate_id` BIGINT UNSIGNED NOT NULL,
  `buyer_user_id` BIGINT UNSIGNED NOT NULL,
  `payment_id` VARCHAR(80) NOT NULL COMMENT 'Paddle transaction id; refunds use {txn}-refund',
  `subscription_id` VARCHAR(64) NULL COMMENT 'Paddle sub_… — locks attribution for renewals',
  `plan` VARCHAR(64) NULL,
  `billing_period` VARCHAR(32) NULL COMMENT 'monthly | annual | …',
  `gross_amount` DECIMAL(12,2) NOT NULL COMMENT 'What the buyer actually paid',
  `paddle_fee` DECIMAL(12,2) NOT NULL,
  `net_amount` DECIMAL(12,2) NOT NULL COMMENT 'gross_amount - paddle_fee',
  `commission_percent` DECIMAL(5,2) NOT NULL,
  `commission_amount` DECIMAL(12,2) NOT NULL COMMENT 'Negative on reversals',
  `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
  `status` ENUM('pending','approved','reversed') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_affiliate_commissions_payment` (`payment_id`, `affiliate_id`),
  KEY `idx_affiliate_commissions_affiliate_created` (`affiliate_id`, `created_at`),
  KEY `idx_affiliate_commissions_subscription` (`subscription_id`),
  KEY `idx_affiliate_commissions_buyer` (`affiliate_id`, `buyer_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `affiliate_payouts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `affiliate_id` BIGINT UNSIGNED NOT NULL,
  `period_start` DATE NOT NULL COMMENT 'First day of the paid calendar month (UTC)',
  `period_end` DATE NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('pending','paid') NOT NULL DEFAULT 'paid',
  `paid_at` DATETIME NULL,
  `paid_by` BIGINT UNSIGNED NULL COMMENT 'Admin users.id who marked it paid',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_affiliate_payouts_period` (`affiliate_id`, `period_start`),
  KEY `idx_affiliate_payouts_period` (`period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `affiliate_link_hits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(32) NOT NULL,
  `hit_date` DATE NOT NULL,
  `ip_hash` CHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_affiliate_link_hits_slug_date` (`slug`, `hit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- First-touch attribution on the account (who brought this user in).
-- MySQL 5.7 has no ADD COLUMN IF NOT EXISTS — re-running this statement on an
-- already migrated database fails with ER_DUP_FIELDNAME, which is harmless.
ALTER TABLE `users`
  ADD COLUMN `referred_by_affiliate_id` BIGINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'affiliates.id that referred this account (first touch, never overwritten)';
