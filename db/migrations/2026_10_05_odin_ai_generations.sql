-- Also lazily ensured by lib/odin-ai.ts, matching the existing AI ledger flow.
CREATE TABLE IF NOT EXISTS odin_ai_generations (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  month_key CHAR(7) NOT NULL,
  used INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month_key)
) ENGINE=InnoDB;
