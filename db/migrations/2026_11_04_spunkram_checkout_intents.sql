CREATE TABLE IF NOT EXISTS spunkram_checkout_intents (
  buyer_id BIGINT UNSIGNED NOT NULL,
  environment VARCHAR(16) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  transaction_id VARCHAR(40) NOT NULL,
  price_id VARCHAR(40) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (buyer_id, environment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
