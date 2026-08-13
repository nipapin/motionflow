-- Email confirmation tokens for new registrations.
-- Runtime also ensures this table via `lib/auth/email-verification.ts`.

CREATE TABLE IF NOT EXISTS `email_verification_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
