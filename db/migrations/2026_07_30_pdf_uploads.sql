-- Persisted list of PDFs uploaded via the "PDF to Link" tool, so users can see
-- their previous links and replace the file behind one without changing its URL.

CREATE TABLE IF NOT EXISTS `pdf_uploads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `r2_key` VARCHAR(512) NOT NULL,
  `url` VARCHAR(1024) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `size` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_r2_key` (`r2_key`),
  KEY `idx_user_updated` (`user_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
