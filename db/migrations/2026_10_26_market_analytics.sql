-- First-party market analytics and aggregated page heatmaps.

CREATE TABLE IF NOT EXISTS market_events (
    id CHAR(36) NOT NULL PRIMARY KEY, user_id BIGINT UNSIGNED NULL, visit_id CHAR(36) NOT NULL,
    action VARCHAR(24) NOT NULL, resource_type VARCHAR(32) NOT NULL, resource_id VARCHAR(191) NULL,
    path VARCHAR(191) NOT NULL, source VARCHAR(16) NOT NULL DEFAULT 'web', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_market_event_date (created_at), KEY idx_market_event_resource (resource_type, resource_id, created_at),
    KEY idx_market_event_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_heatmap_visits (
    id CHAR(36) NOT NULL, day DATE NOT NULL, path VARCHAR(191) NOT NULL, viewport_width SMALLINT UNSIGNED NOT NULL,
    layout VARCHAR(32) NOT NULL, max_scroll TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id,day), KEY idx_heat_visit_date (created_at), KEY idx_heat_visit_page (path, viewport_width, layout,day)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_heatmap_batches (
    id CHAR(36) NOT NULL PRIMARY KEY, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_heat_batch_date (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_heatmap_cells (
    day DATE NOT NULL, path VARCHAR(191) NOT NULL, viewport_width SMALLINT UNSIGNED NOT NULL,
    layout VARCHAR(32) NOT NULL, kind VARCHAR(8) NOT NULL, x TINYINT UNSIGNED NOT NULL, y TINYINT UNSIGNED NOT NULL,
    weight BIGINT UNSIGNED NOT NULL, PRIMARY KEY (day, path, viewport_width, layout, kind, x, y)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
