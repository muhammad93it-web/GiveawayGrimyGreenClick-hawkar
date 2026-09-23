<?php
declare(strict_types=1);

final class Giveaway
{
    private const LOCK_MINUTES = 15;

    public static function current(?string $userId = null): ?array
    {
        $sql = 'SELECT * FROM giveaways';
        $parameters = [];
        if ($userId !== null) {
            $sql .= ' WHERE meta_user_id = ?';
            $parameters[] = $userId;
        }
        $sql .= ' ORDER BY updated_at DESC LIMIT 1';
        $statement = App::db()->prepare($sql);
        $statement->execute($parameters);
        return $statement->fetch() ?: null;
    }

    /** Show actual Page comments to the connected admin for review and moderation of the giveaway. */
    public static function recentComments(string $userId): array
    {
        $giveaway = self::current($userId);
        if (!$giveaway) {
            return [];
        }
        $statement = App::db()->prepare(
            'SELECT display_name, profile_picture_url, comment_text, commented_at
             FROM imported_comments
             WHERE giveaway_id = ? AND external_user_id NOT LIKE "anonymous:%"
             ORDER BY commented_at DESC LIMIT 10'
        );
        $statement->execute([$giveaway['id']]);
        return array_map(static fn(array $row): array => [
            'displayName' => $row['display_name'],
            'profilePictureUrl' => $row['profile_picture_url'] ?: null,
            'message' => $row['comment_text'],
            'commentedAt' => App::iso($row['commented_at']),
        ], $statement->fetchAll());
    }

    public static function projection(?array $giveaway): array
    {
        if (!$giveaway) {
            return [
                'exists' => false,
                'participants' => [],
                'totalComments' => 0,
                'totalParticipants' => 0,
                'commentsWithIdentity' => 0,
                'commentsWithoutIdentity' => 0,
                'participantsCount' => 0,
                'pagesFetched' => 0,
                'importStatus' => 'idle',
                'lastImportError' => null,
                'identityCoverage' => self::emptyIdentityCoverage(),
                'commentImport' => CommentImport::emptyStatus(),
            ];
        }
        $statement = App::db()->prepare(self::identifiedParticipantsSql());
        $statement->execute([$giveaway['id']]);
        $participants = [];
        foreach ($statement->fetchAll() as $row) {
            $participants[] = [
                'participantKey' => hash_hmac('sha256', $row['platform'] . '|' . $row['external_user_id'], App::key()),
                'displayName' => $row['display_name'],
                'profilePictureUrl' => $row['profile_picture_url'] ?: null,
                'commentCount' => (int) $row['comment_count'],
                'rank' => count($participants) + 1,
                'identityAvailable' => true,
            ];
        }
        $identityCoverage = self::identityCoverage((string) $giveaway['id']);
        $import = CommentImport::status($giveaway);
        return [
            'exists' => true,
            'id' => $giveaway['id'],
            'status' => $giveaway['status'],
            'assetId' => $giveaway['asset_id'],
            'postId' => $giveaway['post_id'],
            'postPlatform' => $giveaway['post_platform'],
            'postMessage' => $giveaway['post_message'],
            'prizeCount' => (int) $giveaway['prize_count'],
            'prizeTitle' => $giveaway['prize_title'],
            'totalComments' => (int) $giveaway['total_comments'],
            'totalParticipants' => $identityCoverage['identifiedParticipants'],
            'participantsCount' => $identityCoverage['identifiedParticipants'],
            'commentsWithIdentity' => $identityCoverage['identifiedComments'],
            'commentsWithoutIdentity' => $identityCoverage['anonymousComments'],
            'pagesFetched' => $import['pageCount'],
            'importStatus' => $import['status'],
            'lastImportError' => $import['lastError'],
            'includeReplies' => (bool) $giveaway['include_replies'],
            'lastSyncedAt' => App::iso($giveaway['last_synced_at']),
            'lastError' => $giveaway['last_error'],
            'commentImport' => $import,
            'identityCoverage' => $identityCoverage,
            'participants' => $participants,
        ];
    }

    private static function identifiedParticipantsSql(): string
    {
        return "SELECT *
            FROM participant_aggregates
            WHERE giveaway_id = ?
              AND external_user_id NOT LIKE 'anonymous:%'
            ORDER BY comment_count DESC, most_recent_comment_at DESC, external_user_id ASC
            LIMIT 50";
    }

    public static function upsert(string $userId, array $input): array
    {
        $assetId = trim((string) ($input['assetId'] ?? ''));
        $postId = trim((string) ($input['postId'] ?? ''));
        $prizeTitle = trim((string) ($input['prizeTitle'] ?? ''));
        $prizeCount = (int) ($input['prizeCount'] ?? 0);
        $includeReplies = !array_key_exists('includeReplies', $input) || $input['includeReplies'] === true;
        $reset = ($input['reset'] ?? false) === true;
        if ($assetId === '' || $postId === '' || $prizeTitle === '' || $prizeCount < 1 || $prizeCount > 50) {
            throw new AppException('زانیاریی خەڵات تەواو یان دروست نییە.', 400);
        }
        $post = Meta::post($userId, $assetId, $postId);
        $pdo = App::db();
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare('SELECT * FROM giveaways WHERE meta_user_id = ? FOR UPDATE');
            $statement->execute([$userId]);
            $current = $statement->fetch();
            if ($current && $current['sync_locked_at'] && strtotime($current['sync_locked_at'] . ' UTC') > time() - self::LOCK_MINUTES * 60) {
                throw new AppException('نوێکردنەوەی کۆمێنتەکان بەردەوامە؛ چەند چرکەیەک چاوەڕێ بکە.', 409);
            }
            if ($current) {
                $changedTarget = $current['asset_id'] !== $assetId || $current['post_id'] !== $postId;
                $changedRule = (int) $current['include_replies'] !== ($includeReplies ? 1 : 0);
                if ($changedTarget && !$reset) {
                    throw new AppException('بۆ گۆڕینی پۆست، سەرەتا پاککردنەوەی ڕیزبەندیی پێشوو پشتڕاست بکەرەوە.', 400);
                }
                if ($changedTarget || $changedRule || $reset) {
                    $pdo->prepare('DELETE FROM imported_comments WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare('DELETE FROM participant_aggregates WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare('DELETE FROM comment_import_staging WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare('DELETE FROM comment_import_runs WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare(
                        'UPDATE giveaways SET status="idle", prize_count=?, prize_title=?, asset_id=?, post_id=?, post_platform=?, post_message=?, include_replies=?, total_comments=0, total_participants=0, last_synced_at=NULL, last_error=NULL, sync_locked_at=NULL, sync_locked_by=NULL WHERE id=?'
                    )->execute([$prizeCount, $prizeTitle, $assetId, $postId, $post['platform'], $post['message'], $includeReplies ? 1 : 0, $current['id']]);
                } elseif ($current['status'] !== 'idle') {
                    throw new AppException('لەکاتی پەخشدا ناتوانیت ڕێکخستن بگۆڕیت.', 409);
                } else {
                    $pdo->prepare(
                        'UPDATE giveaways SET prize_count=?, prize_title=?, post_message=?, include_replies=? WHERE id=?'
                    )->execute([$prizeCount, $prizeTitle, $post['message'], $includeReplies ? 1 : 0, $current['id']]);
                }
            } else {
                $id = App::uuid();
                $pdo->prepare(
                    'INSERT INTO giveaways (id, meta_user_id, status, prize_count, prize_title, asset_id, post_id, post_platform, post_message, include_replies) VALUES (?, ?, "idle", ?, ?, ?, ?, ?, ?, ?)'
                )->execute([$id, $userId, $prizeCount, $prizeTitle, $assetId, $postId, $post['platform'], $post['message'], $includeReplies ? 1 : 0]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        return self::syncCurrent($userId);
    }

    public static function setStatus(string $userId, string $status): array
    {
        if (!in_array($status, ['idle', 'running', 'paused', 'completed'], true)) {
            throw new AppException('دۆخی خەڵات نادروستە.', 400);
        }
        $giveaway = self::current($userId);
        if (!$giveaway) {
            throw new AppException('سەرەتا پۆستێک بۆ خەڵاتەکە هەڵبژێرە.', 400);
        }
        if ($status === 'completed') {
            self::sync($giveaway, true, true);
        } else {
            App::db()->prepare('UPDATE giveaways SET status = ? WHERE id = ?')->execute([$status, $giveaway['id']]);
            CommentImport::clearCompletionRequest((string) $giveaway['id']);
        }
        return self::projection(self::current($userId));
    }

    public static function syncCurrent(string $userId): array
    {
        $giveaway = self::current($userId);
        if (!$giveaway) {
            throw new AppException('سەرەتا پۆستێک بۆ خەڵاتەکە هەڵبژێرە.', 400);
        }
        if ($giveaway['status'] === 'completed') {
            throw new AppException('خەڵاتەکە تەواو کراوە؛ پێش نوێکردنەوە دووبارە دەستی پێبکەرەوە.', 409);
        }
        $complete = self::sync($giveaway, false, true);
        if (!$complete) {
            App::db()->prepare('UPDATE giveaways SET status="running" WHERE id=?')
                ->execute([$giveaway['id']]);
        }
        return self::projection(self::current($userId));
    }

    public static function sync(
        array $giveaway,
        bool $completeAfterSync = false,
        bool $freshSnapshot = false
    ): bool
    {
        $lock = App::uuid();
        $statement = App::db()->prepare(
            'UPDATE giveaways SET sync_locked_at = UTC_TIMESTAMP(), sync_locked_by = ? WHERE id = ? AND (sync_locked_at IS NULL OR sync_locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))'
        );
        $statement->execute([$lock, $giveaway['id']]);
        if ($statement->rowCount() !== 1) {
            throw new AppException('نوێکردنەوەیەکی دیکە بەردەوامە؛ چەند چرکەیەک چاوەڕێ بکە.', 409);
        }
        $connection = Meta::connection($giveaway['meta_user_id']);
        try {
            if (!$connection || in_array($connection['token_status'], ['expired', 'reconnect_required'], true)) {
                throw new MetaApiException('مۆڵەتی Meta بەسەرچووە یان پچڕاوە؛ تکایە دووبارە پەیوەستی بکەرەوە.', 401, true);
            }
            return CommentImport::advance(
                $giveaway,
                $connection,
                $lock,
                $completeAfterSync,
                $freshSnapshot
            );
        } catch (Throwable $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            if ($error instanceof MetaApiException && $error->authorizationFailure) {
                Meta::markReconnectIfCurrent($connection ?? ['meta_user_id' => '', 'authorization_version' => '']);
            }
            $message = $error instanceof AppException ? $error->safeMessage : 'نوێکردنەوە سەرکەوتوو نەبوو؛ داتای پێشوو پارێزرا.';
            $message = function_exists('mb_substr') ? mb_substr($message, 0, 255) : substr($message, 0, 255);
            CommentImport::markFailed((string) $giveaway['id'], $message);
            App::db()->prepare('UPDATE giveaways SET last_error = ? WHERE id = ?')->execute([$message, $giveaway['id']]);
            throw $error;
        } finally {
            App::db()->prepare(
                'UPDATE giveaways SET sync_locked_at = NULL, sync_locked_by = NULL WHERE id = ? AND sync_locked_by = ?'
            )->execute([$giveaway['id'], $lock]);
        }
    }

    /**
     * Group comments only by a stable Meta identifier.
     *
     * Anonymous comment keys are unique per comment by design. They must never
     * be combined using a name, photo, message, or any other inferred signal.
     */
    public static function aggregateComments(array $comments): array
    {
        $aggregates = [];
        foreach ($comments as $comment) {
            $key = $comment['platform'] . "\n" . $comment['externalUserId'];
            if (!isset($aggregates[$key])) {
                $aggregates[$key] = [
                    'platform' => $comment['platform'],
                    'externalUserId' => $comment['externalUserId'],
                    'displayName' => $comment['displayName'],
                    'profilePictureUrl' => $comment['profilePictureUrl'],
                    'commentCount' => 0,
                    'mostRecentCommentAt' => $comment['commentedAt'],
                ];
            } else {
                if (
                    ($aggregates[$key]['displayName'] === 'بێ ناو' || trim((string) $aggregates[$key]['displayName']) === '')
                    && $comment['displayName'] !== 'بێ ناو'
                    && trim((string) $comment['displayName']) !== ''
                ) {
                    $aggregates[$key]['displayName'] = $comment['displayName'];
                }
                if (
                    empty($aggregates[$key]['profilePictureUrl'])
                    && is_string($comment['profilePictureUrl'])
                    && trim($comment['profilePictureUrl']) !== ''
                ) {
                    $aggregates[$key]['profilePictureUrl'] = $comment['profilePictureUrl'];
                }
            }
            $aggregates[$key]['commentCount']++;
            if ($comment['commentedAt'] > $aggregates[$key]['mostRecentCommentAt']) {
                $aggregates[$key]['mostRecentCommentAt'] = $comment['commentedAt'];
            }
        }

        $aggregates = array_values($aggregates);
        usort($aggregates, static function (array $a, array $b): int {
            return $b['commentCount'] <=> $a['commentCount']
                ?: strcmp($b['mostRecentCommentAt'], $a['mostRecentCommentAt'])
                ?: strcmp($a['externalUserId'], $b['externalUserId']);
        });
        return $aggregates;
    }

    private static function identityCoverage(string $giveawayId): array
    {
        $comments = App::db()->prepare(
            "SELECT COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN external_user_id LIKE 'anonymous:%' THEN 1 ELSE 0 END), 0) AS anonymous_count
             FROM imported_comments WHERE giveaway_id = ?"
        );
        $comments->execute([$giveawayId]);
        $commentCounts = $comments->fetch() ?: [];

        $participants = App::db()->prepare(
            "SELECT COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN external_user_id LIKE 'anonymous:%' THEN 1 ELSE 0 END), 0) AS anonymous_count
             FROM participant_aggregates WHERE giveaway_id = ?"
        );
        $participants->execute([$giveawayId]);
        $participantCounts = $participants->fetch() ?: [];

        $totalComments = (int) ($commentCounts['total_count'] ?? 0);
        $anonymousComments = (int) ($commentCounts['anonymous_count'] ?? 0);
        $totalParticipants = (int) ($participantCounts['total_count'] ?? 0);
        $anonymousEntries = (int) ($participantCounts['anonymous_count'] ?? 0);

        return [
            'identifiedComments' => max(0, $totalComments - $anonymousComments),
            'anonymousComments' => $anonymousComments,
            'identifiedParticipants' => max(0, $totalParticipants - $anonymousEntries),
            'anonymousEntries' => $anonymousEntries,
        ];
    }

    private static function emptyIdentityCoverage(): array
    {
        return [
            'identifiedComments' => 0,
            'anonymousComments' => 0,
            'identifiedParticipants' => 0,
            'anonymousEntries' => 0,
        ];
    }

    public static function disconnect(string $userId): void
    {
        $pdo = App::db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM meta_connections WHERE meta_user_id = ?')->execute([$userId]);
            $pdo->commit();
            Auth::destroy();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
}
