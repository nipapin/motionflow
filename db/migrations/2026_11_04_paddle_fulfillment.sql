ALTER TABLE subscription_systems
  ADD COLUMN paddle_state_occurred_at DATETIME(6) NULL,
  ADD COLUMN paddle_refunded_at DATETIME(6) NULL;

ALTER TABLE paddle_extra_generation_credit_events
  ADD COLUMN author_id BIGINT UNSIGNED NULL,
  ADD COLUMN refunded_at DATETIME(6) NULL;
