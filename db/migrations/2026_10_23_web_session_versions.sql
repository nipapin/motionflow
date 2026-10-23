-- Shared by Next.js and Laravel. CEP device tokens do not use this version.
CREATE TABLE IF NOT EXISTS user_web_session_versions (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
