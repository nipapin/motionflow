-- Paddle Billing: stable catalog identifiers for subscription rows (from webhook items[].price).
-- Run on your MySQL instance before deploying the updated webhook handler.

ALTER TABLE subscription_systems
  ADD COLUMN paddle_product_id VARCHAR(64) NULL DEFAULT NULL COMMENT 'Paddle product id (pro_…)',
  ADD COLUMN paddle_price_id VARCHAR(64) NULL DEFAULT NULL COMMENT 'Paddle price id (pri_…)';
