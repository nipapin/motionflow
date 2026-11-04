CREATE TABLE IF NOT EXISTS spunkram_paddle_credentials (
  environment ENUM('sandbox', 'production') NOT NULL PRIMARY KEY,
  encrypted_credentials TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS spunkram_storefront_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT IGNORE INTO spunkram_storefront_settings (id, enabled) VALUES (1, 0);
