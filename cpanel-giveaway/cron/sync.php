<?php
declare(strict_types=1);

/**
 * بۆ cPanel Cron Jobs:
 * 0,5,10,15,20,25,30,35,40,45,50,55 * * * * /usr/local/bin/php /home/USERNAME/giveaway-app/cron/sync.php >/dev/null 2>&1
 */
require_once __DIR__ . '/../app/bootstrap.php';

try {
    $pdo = App::db();
    $pdo->exec('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP()');
    $pdo->exec('DELETE FROM oauth_states WHERE expires_at <= UTC_TIMESTAMP()');
    $running = $pdo->query(
        'SELECT g.*, r.status AS import_status
         FROM giveaways g
         LEFT JOIN comment_import_runs r ON r.giveaway_id = g.id
         WHERE g.status = "running"
           AND (r.status IS NULL OR r.status <> "complete" OR g.sync_requested = 1)'
    )->fetchAll();
    foreach ($running as $giveaway) {
        try {
            $freshSnapshot = $giveaway['import_status'] === 'complete'
                && (int) $giveaway['sync_requested'] === 1;
            $complete = Giveaway::sync($giveaway, false, $freshSnapshot);
            echo ($complete ? "Synced giveaway " : "Continuing giveaway import ") . $giveaway['id'] . PHP_EOL;
        } catch (AppException $error) {
            // A lock conflict means a manual pull is already working; no sensitive data is logged.
            echo "Skipped/failed giveaway " . $giveaway['id'] . ": " . $error->status . PHP_EOL;
        }
    }
} catch (Throwable) {
    fwrite(STDERR, "Cron database/bootstrap failure\n");
    exit(1);
}