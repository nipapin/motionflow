-- Paddle `current_billing_period` / transaction `billing_period` — used for AI generation quota windows.

ALTER TABLE subscription_systems
  ADD COLUMN paddle_billing_period_starts_at DATETIME NULL DEFAULT NULL
    COMMENT 'Paddle current_billing_period.starts_at',
  ADD COLUMN paddle_billing_period_ends_at DATETIME NULL DEFAULT NULL
    COMMENT 'Paddle current_billing_period.ends_at (usage: created_at < this)';
