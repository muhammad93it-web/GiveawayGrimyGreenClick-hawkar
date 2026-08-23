-- Upgrade an existing v1.2.x database to v1.3.0.
-- Import this file exactly once in phpMyAdmin before opening the upgraded app.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE imported_comments
  ADD COLUMN parent_comment_hash CHAR(64) NULL AFTER commented_at,
  ADD COLUMN is_reply TINYINT(1) NOT NULL DEFAULT 0 AFTER parent_comment_hash,
  ADD KEY imported_comments_parent_idx (giveaway_id, parent_comment_hash);

CREATE TABLE comment_import_runs (
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
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  PRIMARY KEY (giveaway_id),
  KEY comment_import_runs_status_idx (status),
  CONSTRAINT comment_import_runs_giveaway_fk FOREIGN KEY (giveaway_id)
    REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comment_import_staging (
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