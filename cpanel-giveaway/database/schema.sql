-- MySQL 5.7+ / MariaDB 10.4+ schema for the cPanel PHP package.
-- لە phpMyAdmin، دوای دروستکردنی بنکەی داتا، ئەم فایلە هەمووی import بکە.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS meta_connections (
  meta_user_id VARCHAR(128) NOT NULL,
  singleton_key CHAR(7) NOT NULL DEFAULT 'default',
  admin_name VARCHAR(255) NOT NULL,
  encrypted_user_token MEDIUMTEXT NOT NULL,
  encrypted_long_lived_token MEDIUMTEXT NOT NULL,
  encrypted_page_tokens_json MEDIUMTEXT NOT NULL,
  assets_json MEDIUMTEXT NOT NULL,
  token_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  token_expires_at DATETIME NULL,
  token_checked_at DATETIME NULL,
  authorization_version CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meta_user_id),
  UNIQUE KEY meta_connections_singleton_key_unique (singleton_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) NOT NULL,
  meta_user_id VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY admin_sessions_expiry_idx (expires_at),
  CONSTRAINT admin_sessions_connection_fk FOREIGN KEY (meta_user_id)
    REFERENCES meta_connections(meta_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (state_hash),
  KEY oauth_states_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS giveaways (
  id CHAR(36) NOT NULL,
  meta_user_id VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'idle',
  prize_count INT UNSIGNED NOT NULL DEFAULT 1,
  prize_title VARCHAR(255) NOT NULL DEFAULT '',
  asset_id VARCHAR(128) NOT NULL,
  post_id VARCHAR(191) NOT NULL,
  post_platform VARCHAR(16) NOT NULL,
  post_message TEXT NULL,
  include_replies TINYINT(1) NOT NULL DEFAULT 1,
  total_comments INT UNSIGNED NOT NULL DEFAULT 0,
  total_participants INT UNSIGNED NOT NULL DEFAULT 0,
  last_synced_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  sync_locked_at DATETIME NULL,
  sync_locked_by CHAR(36) NULL,
  sync_requested TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY giveaways_connection_unique (meta_user_id),
  KEY giveaways_running_idx (status),
  KEY giveaways_updated_idx (updated_at),
  CONSTRAINT giveaways_connection_fk FOREIGN KEY (meta_user_id)
    REFERENCES meta_connections(meta_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS imported_comments (
  giveaway_id CHAR(36) NOT NULL,
  external_comment_id VARCHAR(191) NOT NULL,
  external_comment_hash CHAR(64) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  external_user_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  profile_picture_url TEXT NULL,
  comment_text TEXT NULL,
  commented_at DATETIME NOT NULL,
  parent_comment_hash CHAR(64) NULL,
  is_reply TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (giveaway_id, external_comment_hash),
  KEY imported_comments_participant_idx (giveaway_id, platform, external_user_id),
  KEY imported_comments_parent_idx (giveaway_id, parent_comment_hash),
  CONSTRAINT imported_comments_giveaway_fk FOREIGN KEY (giveaway_id)
    REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_import_runs (
  giveaway_id CHAR(36) NOT NULL,
  run_id CHAR(36) NOT NULL,
  source_post_id VARCHAR(191) NOT NULL,
  source_platform VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  phase VARCHAR(16) NOT NULL DEFAULT 'top_level',
  next_after TEXT NULL,
  page_count INT UNSIGNED NOT NULL DEFAULT 0,
  fetched_count INT UNSIGNED NOT NULL DEFAULT 0,
  completion_requested TINYINT(1) NOT NULL DEFAULT 0,
  import_version TINYINT UNSIGNED NOT NULL DEFAULT 3,
  include_replies TINYINT(1) NOT NULL DEFAULT 1,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  PRIMARY KEY (giveaway_id),
  KEY comment_import_runs_status_idx (status),
  CONSTRAINT comment_import_runs_giveaway_fk FOREIGN KEY (giveaway_id)
    REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_import_staging (
  giveaway_id CHAR(36) NOT NULL,
  run_id CHAR(36) NOT NULL,
  external_comment_id VARCHAR(191) NOT NULL,
  external_comment_hash CHAR(64) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  external_user_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  profile_picture_url TEXT NULL,
  comment_text TEXT NULL,
  commented_at DATETIME NOT NULL,
  parent_comment_hash CHAR(64) NULL,
  is_reply TINYINT(1) NOT NULL DEFAULT 0,
  replies_complete TINYINT(1) NOT NULL DEFAULT 1,
  reply_after_cursor TEXT NULL,
  PRIMARY KEY (giveaway_id, external_comment_hash),
  KEY comment_import_staging_run_idx (giveaway_id, run_id, is_reply, replies_complete),
  KEY comment_import_staging_parent_idx (giveaway_id, parent_comment_hash),
  CONSTRAINT comment_import_staging_giveaway_fk FOREIGN KEY (giveaway_id)
    REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS participant_aggregates (
  giveaway_id CHAR(36) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  external_user_id VARCHAR(191) NOT NULL,
  external_user_hash CHAR(64) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  profile_picture_url TEXT NULL,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  rank_position INT UNSIGNED NOT NULL,
  most_recent_comment_at DATETIME NOT NULL,
  PRIMARY KEY (giveaway_id, platform, external_user_hash),
  KEY participant_rank_idx (giveaway_id, rank_position),
  CONSTRAINT participant_aggregates_giveaway_fk FOREIGN KEY (giveaway_id)
    REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;