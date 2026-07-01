-- Idempotency guard for crediting/reversing a third-party author's `users.balance`
-- from a `subscription_systems` row (author-attributed subscriptions/lifetime
-- bundles, e.g. Premiere Gal / Spunkram). Stores the Paddle payment (transaction)
-- id that the current balance credit corresponds to; NULL means "not credited
-- (or already reversed)". Run on your MySQL instance before deploying the
-- updated webhook handler.

ALTER TABLE subscription_systems
  ADD COLUMN author_balance_credited_for_payment_id VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Paddle payment/transaction id last credited to users.balance for this row''s author_id';
