-- Tracks per-user AI generation usage across all tools (image, video, tts, stt).
-- The application also lazily creates this table via `lib/generations.ts`
-- (`CREATE TABLE IF NOT EXISTS`), but this file is the canonical schema for
-- environments where DDL is managed manually.

CREATE TABLE IF NOT EXISTS `user_generations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `tool` VARCHAR(32) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
