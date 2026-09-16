-- Campaign suffixes on affiliate referral links: ?ref={slug}-{campaign}
-- Runtime also applies this via ensureAffiliateSchema() in lib/affiliate/db.ts.

CREATE TABLE IF NOT EXISTS `affiliate_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `affiliate_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(48) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_affiliate_campaigns_code` (`affiliate_id`, `code`),
  KEY `idx_affiliate_campaigns_affiliate` (`affiliate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `affiliate_commissions`
  ADD COLUMN `campaign` VARCHAR(48) NULL DEFAULT NULL AFTER `billing_period`;

ALTER TABLE `affiliate_link_hits`
  ADD COLUMN `campaign` VARCHAR(48) NULL DEFAULT NULL AFTER `slug`;

ALTER TABLE `affiliate_link_hits`
  ADD COLUMN `referrer_host` VARCHAR(191) NULL DEFAULT NULL AFTER `ip_hash`;

ALTER TABLE `users`
  ADD COLUMN `referred_by_campaign` VARCHAR(48) NULL DEFAULT NULL;
