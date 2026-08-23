-- Upgrade an existing v1.3.x database to v1.3.2.
-- Import this file exactly once in phpMyAdmin before opening the upgraded app.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE comment_import_runs
  ADD COLUMN import_version TINYINT UNSIGNED NOT NULL DEFAULT 1
  AFTER completion_requested;