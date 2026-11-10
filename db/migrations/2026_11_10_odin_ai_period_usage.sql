-- Preserve odin_ai_generations as historical UTC-calendar usage.
-- Every user starts their new server-attested period with its full 100/5 allocation.
CREATE TABLE IF NOT EXISTS odin_ai_period_usage (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  used INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, period_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS odin_ai_operations (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tool VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cost INT UNSIGNED NOT NULL,
  response_body MEDIUMTEXT NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,operation_id)
) ENGINE=InnoDB;
