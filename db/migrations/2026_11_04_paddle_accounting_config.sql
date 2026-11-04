CREATE TABLE IF NOT EXISTS paddle_accounting_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  environment ENUM('sandbox', 'production') NOT NULL,
  encrypted_secrets TEXT NOT NULL
) ENGINE=InnoDB;
