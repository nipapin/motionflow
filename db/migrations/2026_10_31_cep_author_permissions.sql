-- CEP permissions belong to a server-verified identity and one author.
-- Odin UUIDs and Motionflow user ids are separate identity namespaces.
CREATE TABLE IF NOT EXISTS cep_author_permissions (
  author_id INT UNSIGNED NOT NULL,
  identity_provider ENUM('motionflow', 'odin') NOT NULL,
  subject_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  permission ENUM('admin', 'beta_updates') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (author_id, identity_provider, subject_id, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Preserve existing CEP admins for current authors, without granting site admin.
-- Existing rows (including revoked grants) are deliberately left unchanged.
INSERT IGNORE INTO cep_author_permissions
  (author_id, identity_provider, subject_id, permission)
SELECT authors.author_id, 'motionflow', CAST(u.id AS CHAR), 'admin'
FROM users u
CROSS JOIN (
  SELECT 6 AS author_id UNION ALL SELECT 1691 UNION ALL SELECT 4141 UNION ALL SELECT 900000001
) authors
WHERE LOWER(TRIM(u.email)) IN (
  'basepackagehelp@gmail.com', 'admin@mail.ru', 'ivanionee@yandex.ru'
);
