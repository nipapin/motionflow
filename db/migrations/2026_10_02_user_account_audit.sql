-- Account history starts when these triggers are installed; no retrospective backfill.
-- No foreign keys: entries and actor IDs survive deletion of either account.
-- Run with scripts/apply-account-audit-migration.mjs (supports DELIMITER).
CREATE TABLE IF NOT EXISTS `user_account_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `source` VARCHAR(64) NOT NULL,
  `action` ENUM('created', 'updated', 'deleted') NOT NULL,
  `changes` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_account_history` (`user_id`, `id`),
  KEY `idx_actor_history` (`actor_user_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER `users_account_audit_insert` AFTER INSERT ON `users`
FOR EACH ROW
BEGIN
  INSERT INTO `user_account_audit` (user_id, actor_user_id, source, action, changes, created_at)
  VALUES (NEW.`id`, @account_audit_actor_id,
          COALESCE(NULLIF(@account_audit_source, ''), 'database'), 'created',
          JSON_OBJECT(
      'id', JSON_OBJECT('before', NULL, 'after', NEW.`id`),
      'name', JSON_OBJECT('before', NULL, 'after', NEW.`name`),
      'email', JSON_OBJECT('before', NULL, 'after', NEW.`email`),
      'email_verified_at', JSON_OBJECT('before', NULL, 'after', NEW.`email_verified_at`),
      'first_name', JSON_OBJECT('before', NULL, 'after', NEW.`first_name`),
      'last_name', JSON_OBJECT('before', NULL, 'after', NEW.`last_name`),
      'city', JSON_OBJECT('before', NULL, 'after', NEW.`city`),
      'address_line', JSON_OBJECT('before', NULL, 'after', NEW.`address_line`),
      'postal_code', JSON_OBJECT('before', NULL, 'after', NEW.`postal_code`),
      'country', JSON_OBJECT('before', NULL, 'after', NEW.`country`),
      'company_name', JSON_OBJECT('before', NULL, 'after', NEW.`company_name`),
      'access', JSON_OBJECT('before', NULL, 'after', NEW.`access`),
      'balance', JSON_OBJECT('before', NULL, 'after', NEW.`balance`),
      'extra_tax', JSON_OBJECT('before', NULL, 'after', NEW.`extra_tax`),
      'awards', JSON_OBJECT('before', NULL, 'after', NEW.`awards`),
      'can_hire', JSON_OBJECT('before', NULL, 'after', NEW.`can_hire`),
      'settings_json', JSON_OBJECT('before', NULL, 'after', NEW.`settings_json`),
      'profile_description', JSON_OBJECT('before', NULL, 'after', NEW.`profile_description`),
      'profile_socials_json', JSON_OBJECT('before', NULL, 'after', NEW.`profile_socials_json`),
      'withdraw_method', JSON_OBJECT('before', NULL, 'after', NEW.`withdraw_method`),
      'withdraw_min_amount', JSON_OBJECT('before', NULL, 'after', NEW.`withdraw_min_amount`),
      'mailing', JSON_OBJECT('before', NULL, 'after', NEW.`mailing`),
      'created_at', JSON_OBJECT('before', NULL, 'after', NEW.`created_at`),
      'subscription_id', JSON_OBJECT('before', NULL, 'after', NEW.`subscription_id`),
      'last_payment_id', JSON_OBJECT('before', NULL, 'after', NEW.`last_payment_id`),
      'last_payment_method', JSON_OBJECT('before', NULL, 'after', NEW.`last_payment_method`),
      'last_payment_four', JSON_OBJECT('before', NULL, 'after', NEW.`last_payment_four`),
      'extra_generations_count', JSON_OBJECT('before', NULL, 'after', NEW.`extra_generations_count`),
      'referred_by_affiliate_id', JSON_OBJECT('before', NULL, 'after', NEW.`referred_by_affiliate_id`),
      'referred_by_campaign', JSON_OBJECT('before', NULL, 'after', NEW.`referred_by_campaign`),
      'google_linked', JSON_OBJECT('before', NULL, 'after', IF(NULLIF(NEW.`google_id`, '') IS NULL, CAST('false' AS JSON), CAST('true' AS JSON)))
    ), UTC_TIMESTAMP(3));
END$$

CREATE TRIGGER `users_account_audit_update` AFTER UPDATE ON `users`
FOR EACH ROW
BEGIN
  DECLARE delta JSON;
  SET delta = JSON_OBJECT();
  IF NOT (CAST(OLD.`id` AS BINARY) <=> CAST(NEW.`id` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.id', JSON_OBJECT('before', OLD.`id`, 'after', NEW.`id`));
  END IF;
  IF NOT (CAST(OLD.`name` AS BINARY) <=> CAST(NEW.`name` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.name', JSON_OBJECT('before', OLD.`name`, 'after', NEW.`name`));
  END IF;
  IF NOT (CAST(OLD.`email` AS BINARY) <=> CAST(NEW.`email` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.email', JSON_OBJECT('before', OLD.`email`, 'after', NEW.`email`));
  END IF;
  IF NOT (CAST(OLD.`email_verified_at` AS BINARY) <=> CAST(NEW.`email_verified_at` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.email_verified_at', JSON_OBJECT('before', OLD.`email_verified_at`, 'after', NEW.`email_verified_at`));
  END IF;
  IF NOT (CAST(OLD.`first_name` AS BINARY) <=> CAST(NEW.`first_name` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.first_name', JSON_OBJECT('before', OLD.`first_name`, 'after', NEW.`first_name`));
  END IF;
  IF NOT (CAST(OLD.`last_name` AS BINARY) <=> CAST(NEW.`last_name` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.last_name', JSON_OBJECT('before', OLD.`last_name`, 'after', NEW.`last_name`));
  END IF;
  IF NOT (CAST(OLD.`city` AS BINARY) <=> CAST(NEW.`city` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.city', JSON_OBJECT('before', OLD.`city`, 'after', NEW.`city`));
  END IF;
  IF NOT (CAST(OLD.`address_line` AS BINARY) <=> CAST(NEW.`address_line` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.address_line', JSON_OBJECT('before', OLD.`address_line`, 'after', NEW.`address_line`));
  END IF;
  IF NOT (CAST(OLD.`postal_code` AS BINARY) <=> CAST(NEW.`postal_code` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.postal_code', JSON_OBJECT('before', OLD.`postal_code`, 'after', NEW.`postal_code`));
  END IF;
  IF NOT (CAST(OLD.`country` AS BINARY) <=> CAST(NEW.`country` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.country', JSON_OBJECT('before', OLD.`country`, 'after', NEW.`country`));
  END IF;
  IF NOT (CAST(OLD.`company_name` AS BINARY) <=> CAST(NEW.`company_name` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.company_name', JSON_OBJECT('before', OLD.`company_name`, 'after', NEW.`company_name`));
  END IF;
  IF NOT (CAST(OLD.`access` AS BINARY) <=> CAST(NEW.`access` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.access', JSON_OBJECT('before', OLD.`access`, 'after', NEW.`access`));
  END IF;
  IF NOT (CAST(OLD.`balance` AS BINARY) <=> CAST(NEW.`balance` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.balance', JSON_OBJECT('before', OLD.`balance`, 'after', NEW.`balance`));
  END IF;
  IF NOT (CAST(OLD.`extra_tax` AS BINARY) <=> CAST(NEW.`extra_tax` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.extra_tax', JSON_OBJECT('before', OLD.`extra_tax`, 'after', NEW.`extra_tax`));
  END IF;
  IF NOT (CAST(OLD.`awards` AS BINARY) <=> CAST(NEW.`awards` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.awards', JSON_OBJECT('before', OLD.`awards`, 'after', NEW.`awards`));
  END IF;
  IF NOT (CAST(OLD.`can_hire` AS BINARY) <=> CAST(NEW.`can_hire` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.can_hire', JSON_OBJECT('before', OLD.`can_hire`, 'after', NEW.`can_hire`));
  END IF;
  IF NOT (CAST(OLD.`settings_json` AS BINARY) <=> CAST(NEW.`settings_json` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.settings_json', JSON_OBJECT('before', OLD.`settings_json`, 'after', NEW.`settings_json`));
  END IF;
  IF NOT (CAST(OLD.`profile_description` AS BINARY) <=> CAST(NEW.`profile_description` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.profile_description', JSON_OBJECT('before', OLD.`profile_description`, 'after', NEW.`profile_description`));
  END IF;
  IF NOT (CAST(OLD.`profile_socials_json` AS BINARY) <=> CAST(NEW.`profile_socials_json` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.profile_socials_json', JSON_OBJECT('before', OLD.`profile_socials_json`, 'after', NEW.`profile_socials_json`));
  END IF;
  IF NOT (CAST(OLD.`withdraw_method` AS BINARY) <=> CAST(NEW.`withdraw_method` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.withdraw_method', JSON_OBJECT('before', OLD.`withdraw_method`, 'after', NEW.`withdraw_method`));
  END IF;
  IF NOT (CAST(OLD.`withdraw_min_amount` AS BINARY) <=> CAST(NEW.`withdraw_min_amount` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.withdraw_min_amount', JSON_OBJECT('before', OLD.`withdraw_min_amount`, 'after', NEW.`withdraw_min_amount`));
  END IF;
  IF NOT (CAST(OLD.`mailing` AS BINARY) <=> CAST(NEW.`mailing` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.mailing', JSON_OBJECT('before', OLD.`mailing`, 'after', NEW.`mailing`));
  END IF;
  IF NOT (CAST(OLD.`created_at` AS BINARY) <=> CAST(NEW.`created_at` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.created_at', JSON_OBJECT('before', OLD.`created_at`, 'after', NEW.`created_at`));
  END IF;
  IF NOT (CAST(OLD.`subscription_id` AS BINARY) <=> CAST(NEW.`subscription_id` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.subscription_id', JSON_OBJECT('before', OLD.`subscription_id`, 'after', NEW.`subscription_id`));
  END IF;
  IF NOT (CAST(OLD.`last_payment_id` AS BINARY) <=> CAST(NEW.`last_payment_id` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.last_payment_id', JSON_OBJECT('before', OLD.`last_payment_id`, 'after', NEW.`last_payment_id`));
  END IF;
  IF NOT (CAST(OLD.`last_payment_method` AS BINARY) <=> CAST(NEW.`last_payment_method` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.last_payment_method', JSON_OBJECT('before', OLD.`last_payment_method`, 'after', NEW.`last_payment_method`));
  END IF;
  IF NOT (CAST(OLD.`last_payment_four` AS BINARY) <=> CAST(NEW.`last_payment_four` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.last_payment_four', JSON_OBJECT('before', OLD.`last_payment_four`, 'after', NEW.`last_payment_four`));
  END IF;
  IF NOT (CAST(OLD.`extra_generations_count` AS BINARY) <=> CAST(NEW.`extra_generations_count` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.extra_generations_count', JSON_OBJECT('before', OLD.`extra_generations_count`, 'after', NEW.`extra_generations_count`));
  END IF;
  IF NOT (CAST(OLD.`referred_by_affiliate_id` AS BINARY) <=> CAST(NEW.`referred_by_affiliate_id` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.referred_by_affiliate_id', JSON_OBJECT('before', OLD.`referred_by_affiliate_id`, 'after', NEW.`referred_by_affiliate_id`));
  END IF;
  IF NOT (CAST(OLD.`referred_by_campaign` AS BINARY) <=> CAST(NEW.`referred_by_campaign` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.referred_by_campaign', JSON_OBJECT('before', OLD.`referred_by_campaign`, 'after', NEW.`referred_by_campaign`));
  END IF;
  IF NOT (CAST(OLD.`google_id` AS BINARY) <=> CAST(NEW.`google_id` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.google_linked', JSON_OBJECT('before', IF(NULLIF(OLD.`google_id`, '') IS NULL, CAST('false' AS JSON), CAST('true' AS JSON)), 'after', IF(NULLIF(NEW.`google_id`, '') IS NULL, CAST('false' AS JSON), CAST('true' AS JSON))));
  END IF;
  -- Sensitive values are never copied; only the fact of a change is recorded.
  IF NOT (CAST(OLD.`password` AS BINARY) <=> CAST(NEW.`password` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.password', JSON_OBJECT('changed', CAST('true' AS JSON)));
  END IF;
  IF NOT (CAST(OLD.`withdraw_account` AS BINARY) <=> CAST(NEW.`withdraw_account` AS BINARY)) THEN
    SET delta = JSON_SET(delta, '$.withdraw_account', JSON_OBJECT('changed', CAST('true' AS JSON)));
  END IF;
  -- Ignore timestamp-only writes and remember_token rotation.
  IF JSON_LENGTH(delta) > 0 THEN
  INSERT INTO `user_account_audit` (user_id, actor_user_id, source, action, changes, created_at)
  VALUES (NEW.`id`, @account_audit_actor_id,
          COALESCE(NULLIF(@account_audit_source, ''), 'database'), 'updated',
          delta, UTC_TIMESTAMP(3));
  END IF;
END$$

CREATE TRIGGER `users_account_audit_delete` AFTER DELETE ON `users`
FOR EACH ROW
BEGIN
  INSERT INTO `user_account_audit` (user_id, actor_user_id, source, action, changes, created_at)
  VALUES (OLD.`id`, @account_audit_actor_id,
          COALESCE(NULLIF(@account_audit_source, ''), 'database'), 'deleted',
          JSON_OBJECT(
      'id', JSON_OBJECT('before', OLD.`id`, 'after', NULL),
      'name', JSON_OBJECT('before', OLD.`name`, 'after', NULL),
      'email', JSON_OBJECT('before', OLD.`email`, 'after', NULL),
      'email_verified_at', JSON_OBJECT('before', OLD.`email_verified_at`, 'after', NULL),
      'first_name', JSON_OBJECT('before', OLD.`first_name`, 'after', NULL),
      'last_name', JSON_OBJECT('before', OLD.`last_name`, 'after', NULL),
      'city', JSON_OBJECT('before', OLD.`city`, 'after', NULL),
      'address_line', JSON_OBJECT('before', OLD.`address_line`, 'after', NULL),
      'postal_code', JSON_OBJECT('before', OLD.`postal_code`, 'after', NULL),
      'country', JSON_OBJECT('before', OLD.`country`, 'after', NULL),
      'company_name', JSON_OBJECT('before', OLD.`company_name`, 'after', NULL),
      'access', JSON_OBJECT('before', OLD.`access`, 'after', NULL),
      'balance', JSON_OBJECT('before', OLD.`balance`, 'after', NULL),
      'extra_tax', JSON_OBJECT('before', OLD.`extra_tax`, 'after', NULL),
      'awards', JSON_OBJECT('before', OLD.`awards`, 'after', NULL),
      'can_hire', JSON_OBJECT('before', OLD.`can_hire`, 'after', NULL),
      'settings_json', JSON_OBJECT('before', OLD.`settings_json`, 'after', NULL),
      'profile_description', JSON_OBJECT('before', OLD.`profile_description`, 'after', NULL),
      'profile_socials_json', JSON_OBJECT('before', OLD.`profile_socials_json`, 'after', NULL),
      'withdraw_method', JSON_OBJECT('before', OLD.`withdraw_method`, 'after', NULL),
      'withdraw_min_amount', JSON_OBJECT('before', OLD.`withdraw_min_amount`, 'after', NULL),
      'mailing', JSON_OBJECT('before', OLD.`mailing`, 'after', NULL),
      'created_at', JSON_OBJECT('before', OLD.`created_at`, 'after', NULL),
      'subscription_id', JSON_OBJECT('before', OLD.`subscription_id`, 'after', NULL),
      'last_payment_id', JSON_OBJECT('before', OLD.`last_payment_id`, 'after', NULL),
      'last_payment_method', JSON_OBJECT('before', OLD.`last_payment_method`, 'after', NULL),
      'last_payment_four', JSON_OBJECT('before', OLD.`last_payment_four`, 'after', NULL),
      'extra_generations_count', JSON_OBJECT('before', OLD.`extra_generations_count`, 'after', NULL),
      'referred_by_affiliate_id', JSON_OBJECT('before', OLD.`referred_by_affiliate_id`, 'after', NULL),
      'referred_by_campaign', JSON_OBJECT('before', OLD.`referred_by_campaign`, 'after', NULL),
      'google_linked', JSON_OBJECT('before', IF(NULLIF(OLD.`google_id`, '') IS NULL, CAST('false' AS JSON), CAST('true' AS JSON)), 'after', NULL)
    ), UTC_TIMESTAMP(3));
END$$
DELIMITER ;

