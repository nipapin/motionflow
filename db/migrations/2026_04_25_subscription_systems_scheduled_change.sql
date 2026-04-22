-- Scheduled plan change (downgrade) tracking — used so the pricing page can show
-- "Your plan changes to X on DD.MM.YYYY" and so we can resolve the *next* tier
-- without re-querying Paddle on every render.
--
-- Populated by:
--   1. POST /api/subscription/schedule-downgrade   (we fill price/product/plan + effective_at)
--   2. Paddle webhook subscription.updated         (when scheduled_change.action present)
-- Cleared by:
--   1. DELETE /api/subscription/scheduled-change
--   2. Paddle webhook subscription.activated       (after Paddle applies the swap)

ALTER TABLE subscription_systems
  ADD COLUMN scheduled_change_action VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Paddle scheduled_change.action: cancel | pause | update',
  ADD COLUMN scheduled_change_effective_at DATETIME NULL DEFAULT NULL
    COMMENT 'When the scheduled change applies (typically current_billing_period.ends_at)',
  ADD COLUMN scheduled_change_paddle_product_id VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Target Paddle product id (pro_…) for action=update',
  ADD COLUMN scheduled_change_paddle_price_id VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Target Paddle price id (pri_…) for action=update',
  ADD COLUMN scheduled_change_paddle_product_name VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Target Paddle product display name for action=update',
  ADD COLUMN scheduled_change_plan ENUM('monthly','quarter','annual','lifetime') NULL DEFAULT NULL
    COMMENT 'Target billing plan for action=update';
