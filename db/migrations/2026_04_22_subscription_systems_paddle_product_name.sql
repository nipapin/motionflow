ALTER TABLE subscription_systems
  ADD COLUMN paddle_product_name VARCHAR(255) NULL DEFAULT NULL COMMENT 'Display name from Paddle (product or price)' AFTER paddle_price_id;
