CREATE TABLE IF NOT EXISTS admin_campaigns (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  config_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_campaign_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  account_email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL DEFAULT '',
  last_name VARCHAR(255) NOT NULL DEFAULT '',
  user_id BIGINT UNSIGNED NULL,
  created_user TINYINT NOT NULL DEFAULT 0,
  action VARCHAR(30) NULL,
  base_at DATETIME NULL,
  expires_at DATETIME NULL,
  entitlement_id VARCHAR(64) NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  plan_json JSON NULL,
  billing_json JSON NULL,
  outbox_json JSON NULL,
  mail_started_at DATETIME NULL,
  sent_at DATETIME NULL,
  provider_id VARCHAR(100) NULL,
  last_error VARCHAR(500) NULL,
  UNIQUE KEY campaign_account (campaign_id,account_email),
  KEY campaign_state (campaign_id,state),
  CONSTRAINT campaign_recipients_parent FOREIGN KEY (campaign_id) REFERENCES admin_campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
