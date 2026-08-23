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
    $running = $pdo->query('SELECT * FROM giveaways WHERE status = "running"')->fetchAll();
    foreach ($running as $giveaway) {
        try {
            $complete = Giveaway::sync($giveaway);
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