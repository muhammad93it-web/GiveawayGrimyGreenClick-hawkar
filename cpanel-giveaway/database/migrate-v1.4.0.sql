-- Upgrade an existing v1.3.x database to v1.4.0.
-- Safe for databases that already received migrate-v1.3.2.sql.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

SET @db_name = DATABASE();
SET @add_include_replies = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE giveaways ADD COLUMN include_replies TINYINT(1) NOT NULL DEFAULT 1 AFTER post_message',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'giveaways' AND column_name = 'include_replies'
);
PREPARE add_include_replies FROM @add_include_replies;
EXECUTE add_include_replies;
DEALLOCATE PREPARE add_include_replies;

SET @add_import_version = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE comment_import_runs ADD COLUMN import_version TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER completion_requested',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'comment_import_runs' AND column_name = 'import_version'
);
PREPARE add_import_version FROM @add_import_version;
EXECUTE add_import_version;
DEALLOCATE PREPARE add_import_version;

SET @add_run_include_replies = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE comment_import_runs ADD COLUMN include_replies TINYINT(1) NOT NULL DEFAULT 1 AFTER import_version',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'comment_import_runs' AND column_name = 'include_replies'
);
PREPARE add_run_include_replies FROM @add_run_include_replies;
EXECUTE add_run_include_replies;
DEALLOCATE PREPARE add_run_include_replies;

SET @add_sync_requested = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE giveaways ADD COLUMN sync_requested TINYINT(1) NOT NULL DEFAULT 1 AFTER sync_locked_by',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'giveaways' AND column_name = 'sync_requested'
);
PREPARE add_sync_requested FROM @add_sync_requested;
EXECUTE add_sync_requested;
DEALLOCATE PREPARE add_sync_requested;