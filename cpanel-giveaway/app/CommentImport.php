<?php
declare(strict_types=1);

/**
 * Resumable historical comment import.
 *
 * A new snapshot is built in staging and only replaces the public ranking after
 * Meta reports that both the top-level stream and all reply pages are complete.
 */
final class CommentImport
{
    private const MAX_PAGE_REQUESTS_PER_PASS = 4;
    private const STRATEGY_VERSION = 3;

    public static function emptyStatus(): array
    {
        return [
            'status' => 'idle',
            'phase' => null,
            'pageCount' => 0,
            'fetchedComments' => 0,
            'startedAt' => null,
            'completedAt' => null,
            'lastError' => null,
            'completionRequested' => false,
            'migrationRequired' => false,
        ];
    }

    public static function status(array $giveaway): array
    {
        try {
            $statement = App::db()->prepare('SELECT * FROM comment_import_runs WHERE giveaway_id = ?');
            $statement->execute([$giveaway['id']]);
            $run = $statement->fetch();
        } catch (PDOException $error) {
            if (self::isMissingImportSchema($error)) {
                $status = self::emptyStatus();
                $status['status'] = 'migration_required';
                $status['migrationRequired'] = true;
                return $status;
            }
            throw $error;
        }

        if (
            !$run
            || $run['source_post_id'] !== $giveaway['post_id']
            || $run['source_platform'] !== $giveaway['post_platform']
        ) {
            return self::emptyStatus();
        }

        return [
            'status' => $run['status'],
            'phase' => $run['phase'],
            'pageCount' => (int) $run['page_count'],
            'fetchedComments' => (int) $run['fetched_count'],
            'startedAt' => App::iso($run['started_at']),
            'completedAt' => App::iso($run['completed_at']),
            'lastError' => $run['last_error'],
            'completionRequested' => (bool) $run['completion_requested'],
            'migrationRequired' => false,
        ];
    }

    public static function clearCompletionRequest(string $giveawayId): void
    {
        try {
            App::db()->prepare(
                'UPDATE comment_import_runs SET completion_requested = 0 WHERE giveaway_id = ?'
            )->execute([$giveawayId]);
        } catch (PDOException $error) {
            if (!self::isMissingImportSchema($error)) {
                throw $error;
            }
        }
    }

    public static function advance(
        array $giveaway,
        array $connection,
        string $lock,
        bool $completeAfterSync = false,
        bool $freshSnapshot = false
    ): bool {
        $run = self::startOrResume($giveaway, $completeAfterSync, $freshSnapshot);

        for ($requests = 0; $requests < self::MAX_PAGE_REQUESTS_PER_PASS;) {
            if ($run['phase'] === 'top_level') {
                $page = Meta::commentPage(
                    $giveaway,
                    $connection,
                    self::nullableString($run['next_after'])
                );
                self::saveTopLevelPage($giveaway, $run, $page, $lock);
                $requests++;
                $run = self::run((string) $giveaway['id'], (string) $run['run_id']);
                continue;
            }

            if ($run['phase'] === 'replies') {
                $parent = self::nextReplyParent((string) $giveaway['id'], (string) $run['run_id']);
                if (!$parent) {
                    self::finalize($giveaway, $run, $lock);
                    return true;
                }
                $page = Meta::replyPage(
                    $giveaway,
                    $connection,
                    (string) $parent['external_comment_id'],
                    self::nullableString($parent['reply_after_cursor'])
                );
                self::saveReplyPage($giveaway, $run, $parent, $page, $lock);
                $requests++;
                $run = self::run((string) $giveaway['id'], (string) $run['run_id']);
                continue;
            }

            if ($run['phase'] === 'complete') {
                return true;
            }

            throw new AppException('دۆخی هێنانی کۆمێنتە کۆنەکان نادروستە.', 500);
        }

        if ($run['phase'] === 'replies' && !self::nextReplyParent((string) $giveaway['id'], (string) $run['run_id'])) {
            self::finalize($giveaway, $run, $lock);
            return true;
        }

        return false;
    }

    public static function markFailed(string $giveawayId, string $message): void
    {
        try {
            App::db()->prepare(
                'UPDATE comment_import_runs
                 SET status = "failed", last_error = ?, updated_at = UTC_TIMESTAMP()
                 WHERE giveaway_id = ? AND status = "running"'
            )->execute([$message, $giveawayId]);
        } catch (PDOException $error) {
            if (!self::isMissingImportSchema($error)) {
                throw $error;
            }
        }
    }

    private static function startOrResume(
        array $giveaway,
        bool $completeAfterSync,
        bool $freshSnapshot
    ): array
    {
        $pdo = App::db();
        try {
            $pdo->beginTransaction();
            $statement = $pdo->prepare('SELECT * FROM comment_import_runs WHERE giveaway_id = ? FOR UPDATE');
            $statement->execute([$giveaway['id']]);
            $run = $statement->fetch();
            $newRun = !$run
                || $run['source_post_id'] !== $giveaway['post_id']
                || $run['source_platform'] !== $giveaway['post_platform']
                || ($freshSnapshot && $run['status'] === 'complete')
                || (int) ($run['import_version'] ?? 0) < self::STRATEGY_VERSION
                || (int) ($run['include_replies'] ?? 1) !== (int) ($giveaway['include_replies'] ?? 1);

            if ($newRun) {
                $runId = App::uuid();
                $pdo->prepare('DELETE FROM comment_import_staging WHERE giveaway_id = ?')
                    ->execute([$giveaway['id']]);
                $pdo->prepare(
                    'INSERT INTO comment_import_runs
                        (giveaway_id, run_id, source_post_id, source_platform, status, phase,
                         next_after, page_count, fetched_count, completion_requested,
                         import_version, include_replies, started_at, completed_at, last_error)
                     VALUES (?, ?, ?, ?, "running", "top_level", NULL, 0, 0, ?, ?, ?, UTC_TIMESTAMP(), NULL, NULL)
                     ON DUPLICATE KEY UPDATE
                        run_id=VALUES(run_id), source_post_id=VALUES(source_post_id),
                        source_platform=VALUES(source_platform), status="running", phase="top_level",
                        next_after=NULL, page_count=0, fetched_count=0,
                        completion_requested=VALUES(completion_requested),
                        import_version=VALUES(import_version),
                        include_replies=VALUES(include_replies),
                        started_at=UTC_TIMESTAMP(), completed_at=NULL, last_error=NULL'
                )->execute([
                    $giveaway['id'],
                    $runId,
                    $giveaway['post_id'],
                    $giveaway['post_platform'],
                    $completeAfterSync ? 1 : 0,
                    self::STRATEGY_VERSION,
                    (int) ($giveaway['include_replies'] ?? 1),
                ]);
                $pdo->prepare('UPDATE giveaways SET sync_requested=0 WHERE id=?')
                    ->execute([$giveaway['id']]);
            } elseif ($run['status'] !== 'complete') {
                $pdo->prepare(
                    'UPDATE comment_import_runs
                     SET status="running", last_error=NULL,
                         completion_requested = CASE WHEN ? = 1 THEN 1 ELSE completion_requested END,
                         updated_at=UTC_TIMESTAMP()
                     WHERE giveaway_id=?'
                )->execute([$completeAfterSync ? 1 : 0, $giveaway['id']]);
            }

            if ($completeAfterSync) {
                $pdo->prepare('UPDATE giveaways SET status="running" WHERE id=?')
                    ->execute([$giveaway['id']]);
            }

            $statement->execute([$giveaway['id']]);
            $current = $statement->fetch();
            $pdo->commit();
            if (!$current) {
                throw new AppException('هێنانی کۆمێنتە کۆنەکان دەست پێ نەکرد.', 500);
            }
            return $current;
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if (self::isMissingImportSchema($error)) {
                throw new AppException('سەرەتا نوێکردنەوەی بنکەی داتای وەشانی ١.٣ جێبەجێ بکە.', 503);
            }
            throw $error;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }

    private static function saveTopLevelPage(array $giveaway, array $run, array $page, string $lock): void
    {
        $pdo = App::db();
        $pdo->beginTransaction();
        try {
            self::assertLock($pdo, (string) $giveaway['id'], $lock);
            self::assertRun($pdo, (string) $giveaway['id'], (string) $run['run_id']);
            self::storeComments($pdo, $giveaway, $run, $page['comments'] ?? []);
            $next = self::nullableString($page['nextAfter'] ?? null);
            $count = self::stagingCount($pdo, (string) $giveaway['id'], (string) $run['run_id']);
            $pdo->prepare(
                'UPDATE comment_import_runs
                 SET phase=?, next_after=?, page_count=page_count+1, fetched_count=?,
                     status="running", last_error=NULL, updated_at=UTC_TIMESTAMP()
                 WHERE giveaway_id=? AND run_id=?'
            )->execute([
                $next === null ? 'replies' : 'top_level',
                $next,
                $count,
                $giveaway['id'],
                $run['run_id'],
            ]);
            $pdo->prepare('UPDATE giveaways SET last_error=NULL WHERE id=?')
                ->execute([$giveaway['id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
    }

    private static function saveReplyPage(
        array $giveaway,
        array $run,
        array $parent,
        array $page,
        string $lock
    ): void {
        $pdo = App::db();
        $pdo->beginTransaction();
        try {
            self::assertLock($pdo, (string) $giveaway['id'], $lock);
            self::assertRun($pdo, (string) $giveaway['id'], (string) $run['run_id']);
            self::storeComments($pdo, $giveaway, $run, $page['comments'] ?? []);
            $next = self::nullableString($page['nextAfter'] ?? null);
            $pdo->prepare(
                'UPDATE comment_import_staging
                 SET replies_complete=?, reply_after_cursor=?
                 WHERE giveaway_id=? AND run_id=? AND external_comment_hash=? AND is_reply=0'
            )->execute([
                $next === null ? 1 : 0,
                $next,
                $giveaway['id'],
                $run['run_id'],
                $parent['external_comment_hash'],
            ]);
            $count = self::stagingCount($pdo, (string) $giveaway['id'], (string) $run['run_id']);
            $pdo->prepare(
                'UPDATE comment_import_runs
                 SET page_count=page_count+1, fetched_count=?, status="running",
                     last_error=NULL, updated_at=UTC_TIMESTAMP()
                 WHERE giveaway_id=? AND run_id=?'
            )->execute([$count, $giveaway['id'], $run['run_id']]);
            $pdo->prepare('UPDATE giveaways SET last_error=NULL WHERE id=?')
                ->execute([$giveaway['id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
    }

    private static function storeComments(PDO $pdo, array $giveaway, array $run, array $comments): void
    {
        $insert = $pdo->prepare(
            'INSERT INTO comment_import_staging
                (giveaway_id, run_id, external_comment_id, external_comment_hash, platform,
                 external_user_id, display_name, profile_picture_url, comment_text, commented_at,
                 parent_comment_hash, is_reply, replies_complete, reply_after_cursor)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                run_id=VALUES(run_id), platform=VALUES(platform),
                display_name=IF(
                    VALUES(external_user_id) LIKE "anonymous:%"
                    AND external_user_id NOT LIKE "anonymous:%",
                    display_name, VALUES(display_name)
                ),
                profile_picture_url=IF(
                    VALUES(external_user_id) LIKE "anonymous:%"
                    AND external_user_id NOT LIKE "anonymous:%",
                    profile_picture_url, VALUES(profile_picture_url)
                ),
                external_user_id=IF(
                    VALUES(external_user_id) LIKE "anonymous:%"
                    AND external_user_id NOT LIKE "anonymous:%",
                    external_user_id, VALUES(external_user_id)
                ),
                comment_text=VALUES(comment_text),
                commented_at=VALUES(commented_at), parent_comment_hash=VALUES(parent_comment_hash),
                is_reply=VALUES(is_reply), replies_complete=VALUES(replies_complete),
                reply_after_cursor=VALUES(reply_after_cursor)'
        );
        foreach ($comments as $comment) {
            $id = (string) ($comment['externalCommentId'] ?? '');
            if ($id === '') {
                continue;
            }
            $parentId = self::nullableString($comment['parentCommentId'] ?? null);
            $insert->execute([
                $giveaway['id'],
                $run['run_id'],
                $id,
                hash('sha256', $id),
                $comment['platform'],
                $comment['externalUserId'],
                $comment['displayName'],
                $comment['profilePictureUrl'],
                $comment['text'],
                $comment['commentedAt'],
                $parentId === null ? null : hash('sha256', $parentId),
                !empty($comment['isReply']) ? 1 : 0,
                !empty($comment['repliesComplete']) ? 1 : 0,
                self::nullableString($comment['replyAfter'] ?? null),
            ]);
        }
    }

    private static function finalize(array $giveaway, array $run, string $lock): void
    {
        $statement = App::db()->prepare(
            'SELECT external_comment_id, platform, external_user_id, display_name,
                    profile_picture_url, comment_text, commented_at
             FROM comment_import_staging
             WHERE giveaway_id=? AND run_id=?
             ORDER BY commented_at ASC, external_comment_hash ASC'
        );
        $statement->execute([$giveaway['id'], $run['run_id']]);
        $comments = [];
        foreach ($statement->fetchAll() as $row) {
            $comments[] = [
                'externalCommentId' => $row['external_comment_id'],
                'platform' => $row['platform'],
                'externalUserId' => $row['external_user_id'],
                'displayName' => $row['display_name'],
                'profilePictureUrl' => $row['profile_picture_url'] ?: null,
                'text' => $row['comment_text'] ?? '',
                'commentedAt' => $row['commented_at'],
            ];
        }
        $aggregates = Giveaway::aggregateComments($comments);

        $pdo = App::db();
        $pdo->beginTransaction();
        try {
            self::assertLock($pdo, (string) $giveaway['id'], $lock);
            $currentRun = self::assertRun($pdo, (string) $giveaway['id'], (string) $run['run_id']);
            $pending = $pdo->prepare(
                'SELECT COUNT(*) FROM comment_import_staging
                 WHERE giveaway_id=? AND run_id=? AND is_reply=0 AND replies_complete=0'
            );
            $pending->execute([$giveaway['id'], $run['run_id']]);
            if ((int) $pending->fetchColumn() !== 0) {
                throw new AppException('وەڵامەکانی هەندێک کۆمێنت هێشتا تەواو نەهاتوون.', 409);
            }

            $pdo->prepare('DELETE FROM imported_comments WHERE giveaway_id = ?')
                ->execute([$giveaway['id']]);
            $pdo->prepare('DELETE FROM participant_aggregates WHERE giveaway_id = ?')
                ->execute([$giveaway['id']]);
            $pdo->prepare(
                'INSERT INTO imported_comments
                    (giveaway_id, external_comment_id, external_comment_hash, platform,
                     external_user_id, display_name, profile_picture_url, comment_text,
                     commented_at, parent_comment_hash, is_reply)
                 SELECT giveaway_id, external_comment_id, external_comment_hash, platform,
                        external_user_id, display_name, profile_picture_url, comment_text,
                        commented_at, parent_comment_hash, is_reply
                 FROM comment_import_staging WHERE giveaway_id=? AND run_id=?'
            )->execute([$giveaway['id'], $run['run_id']]);

            $insertParticipant = $pdo->prepare(
                'INSERT INTO participant_aggregates
                    (giveaway_id, platform, external_user_id, external_user_hash, display_name,
                     profile_picture_url, comment_count, rank_position, most_recent_comment_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($aggregates as $index => $participant) {
                $insertParticipant->execute([
                    $giveaway['id'],
                    $participant['platform'],
                    $participant['externalUserId'],
                    hash('sha256', $participant['externalUserId']),
                    $participant['displayName'],
                    $participant['profilePictureUrl'],
                    $participant['commentCount'],
                    $index + 1,
                    $participant['mostRecentCommentAt'],
                ]);
            }
            $identifiedParticipantCount = count(array_filter(
                $aggregates,
                static fn(array $participant): bool =>
                    !str_starts_with((string) $participant['externalUserId'], 'anonymous:')
            ));

            $statusSql = !empty($currentRun['completion_requested']) ? ', status="completed"' : '';
            $pdo->prepare(
                'UPDATE giveaways
                 SET total_comments=?, total_participants=?, last_synced_at=UTC_TIMESTAMP(),
                     last_error=NULL' . $statusSql . '
                 WHERE id=?'
            )->execute([count($comments), $identifiedParticipantCount, $giveaway['id']]);
            $pdo->prepare(
                'UPDATE comment_import_runs
                 SET status="complete", phase="complete", next_after=NULL,
                     fetched_count=?, completion_requested=0, completed_at=UTC_TIMESTAMP(),
                     last_error=NULL, updated_at=UTC_TIMESTAMP()
                 WHERE giveaway_id=? AND run_id=?'
            )->execute([count($comments), $giveaway['id'], $run['run_id']]);
            $pdo->prepare('DELETE FROM comment_import_staging WHERE giveaway_id=? AND run_id=?')
                ->execute([$giveaway['id'], $run['run_id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
    }

    private static function nextReplyParent(string $giveawayId, string $runId): ?array
    {
        $statement = App::db()->prepare(
            'SELECT external_comment_id, external_comment_hash, reply_after_cursor
             FROM comment_import_staging
             WHERE giveaway_id=? AND run_id=? AND is_reply=0 AND replies_complete=0
             ORDER BY commented_at ASC, external_comment_hash ASC
             LIMIT 1'
        );
        $statement->execute([$giveawayId, $runId]);
        return $statement->fetch() ?: null;
    }

    private static function run(string $giveawayId, string $runId): array
    {
        $statement = App::db()->prepare(
            'SELECT * FROM comment_import_runs WHERE giveaway_id=? AND run_id=?'
        );
        $statement->execute([$giveawayId, $runId]);
        $run = $statement->fetch();
        if (!$run) {
            throw new AppException('دۆخی هێنانی کۆمێنتەکان گۆڕاوە؛ دووبارە هەوڵ بدەرەوە.', 409);
        }
        return $run;
    }

    private static function assertRun(PDO $pdo, string $giveawayId, string $runId): array
    {
        $statement = $pdo->prepare(
            'SELECT * FROM comment_import_runs WHERE giveaway_id=? AND run_id=? FOR UPDATE'
        );
        $statement->execute([$giveawayId, $runId]);
        $run = $statement->fetch();
        if (!$run) {
            throw new AppException('هێنانی کۆمێنتەکان لە کارێکی نوێترەوە گۆڕاوە.', 409);
        }
        return $run;
    }

    private static function assertLock(PDO $pdo, string $giveawayId, string $lock): void
    {
        $statement = $pdo->prepare('SELECT sync_locked_by FROM giveaways WHERE id=? FOR UPDATE');
        $statement->execute([$giveawayId]);
        $current = $statement->fetchColumn();
        if (!is_string($current) || !App::safeEqual($lock, $current)) {
            throw new AppException('قوفڵی نوێکردنەوە گۆڕاوە؛ داتای پێشوو پارێزرا.', 409);
        }
    }

    private static function stagingCount(PDO $pdo, string $giveawayId, string $runId): int
    {
        $statement = $pdo->prepare(
            'SELECT COUNT(*) FROM comment_import_staging WHERE giveaway_id=? AND run_id=?'
        );
        $statement->execute([$giveawayId, $runId]);
        return (int) $statement->fetchColumn();
    }

    private static function nullableString(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value === '' ? null : $value;
    }

    private static function isMissingImportSchema(PDOException $error): bool
    {
        $driverCode = (int) ($error->errorInfo[1] ?? 0);
        return (string) $error->getCode() === '42S02' || $driverCode === 1146;
    }
}