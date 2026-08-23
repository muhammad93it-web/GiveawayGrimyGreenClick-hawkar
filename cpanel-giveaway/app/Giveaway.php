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

    public static function projection(?array $giveaway): array
    {
        if (!$giveaway) {
            return ['exists' => false, 'participants' => [], 'totalComments' => 0, 'totalParticipants' => 0];
        }
        $statement = App::db()->prepare(
            'SELECT * FROM participant_aggregates WHERE giveaway_id = ? ORDER BY rank_position ASC LIMIT 50'
        );
        $statement->execute([$giveaway['id']]);
        $participants = [];
        foreach ($statement->fetchAll() as $row) {
            $participants[] = [
                'participantKey' => hash_hmac('sha256', $row['platform'] . '|' . $row['external_user_id'], App::key()),
                'displayName' => $row['display_name'],
                'profilePictureUrl' => $row['profile_picture_url'] ?: null,
                'commentCount' => (int) $row['comment_count'],
                'rank' => (int) $row['rank_position'],
            ];
        }
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
            'totalParticipants' => (int) $giveaway['total_participants'],
            'lastSyncedAt' => App::iso($giveaway['last_synced_at']),
            'lastError' => $giveaway['last_error'],
            'participants' => $participants,
        ];
    }

    public static function upsert(string $userId, array $input): array
    {
        $assetId = trim((string) ($input['assetId'] ?? ''));
        $postId = trim((string) ($input['postId'] ?? ''));
        $prizeTitle = trim((string) ($input['prizeTitle'] ?? ''));
        $prizeCount = (int) ($input['prizeCount'] ?? 0);
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
                if ($changedTarget && !$reset) {
                    throw new AppException('بۆ گۆڕینی پۆست، سەرەتا پاککردنەوەی ڕیزبەندیی پێشوو پشتڕاست بکەرەوە.', 400);
                }
                if ($changedTarget || $reset) {
                    $pdo->prepare('DELETE FROM imported_comments WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare('DELETE FROM participant_aggregates WHERE giveaway_id = ?')->execute([$current['id']]);
                    $pdo->prepare(
                        'UPDATE giveaways SET status="idle", prize_count=?, prize_title=?, asset_id=?, post_id=?, post_platform=?, post_message=?, total_comments=0, total_participants=0, last_synced_at=NULL, last_error=NULL, sync_locked_at=NULL, sync_locked_by=NULL WHERE id=?'
                    )->execute([$prizeCount, $prizeTitle, $assetId, $postId, $post['platform'], $post['message'], $current['id']]);
                } elseif ($current['status'] !== 'idle') {
                    throw new AppException('لەکاتی پەخشدا ناتوانیت ڕێکخستن بگۆڕیت.', 409);
                } else {
                    $pdo->prepare(
                        'UPDATE giveaways SET prize_count=?, prize_title=?, post_message=? WHERE id=?'
                    )->execute([$prizeCount, $prizeTitle, $post['message'], $current['id']]);
                }
            } else {
                $id = App::uuid();
                $pdo->prepare(
                    'INSERT INTO giveaways (id, meta_user_id, status, prize_count, prize_title, asset_id, post_id, post_platform, post_message) VALUES (?, ?, "idle", ?, ?, ?, ?, ?, ?)'
                )->execute([$id, $userId, $prizeCount, $prizeTitle, $assetId, $postId, $post['platform'], $post['message']]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        return self::projection(self::current($userId));
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
            self::sync($giveaway, true);
        } else {
            App::db()->prepare('UPDATE giveaways SET status = ? WHERE id = ?')->execute([$status, $giveaway['id']]);
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
        self::sync($giveaway);
        return self::projection(self::current($userId));
    }

    public static function sync(array $giveaway, bool $completeAfterSync = false): void
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
            $comments = Meta::comments($giveaway, $connection);
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

            $pdo = App::db();
            $pdo->beginTransaction();
            $lockCheck = $pdo->prepare('SELECT sync_locked_by FROM giveaways WHERE id = ? FOR UPDATE');
            $lockCheck->execute([$giveaway['id']]);
            $currentLock = $lockCheck->fetchColumn();
            if (!is_string($currentLock) || !App::safeEqual($lock, $currentLock)) {
                throw new AppException('قوفڵی نوێکردنەوە گۆڕاوە؛ داتای پێشوو پارێزرا.', 409);
            }
            $pdo->prepare('DELETE FROM imported_comments WHERE giveaway_id = ?')->execute([$giveaway['id']]);
            $pdo->prepare('DELETE FROM participant_aggregates WHERE giveaway_id = ?')->execute([$giveaway['id']]);
            $insertComment = $pdo->prepare(
                'INSERT INTO imported_comments (giveaway_id, external_comment_id, external_comment_hash, platform, external_user_id, display_name, profile_picture_url, comment_text, commented_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($comments as $comment) {
                $insertComment->execute([
                    $giveaway['id'], $comment['externalCommentId'], hash('sha256', $comment['externalCommentId']),
                    $comment['platform'], $comment['externalUserId'],
                    $comment['displayName'], $comment['profilePictureUrl'], $comment['text'], $comment['commentedAt'],
                ]);
            }
            $insertParticipant = $pdo->prepare(
                'INSERT INTO participant_aggregates (giveaway_id, platform, external_user_id, external_user_hash, display_name, profile_picture_url, comment_count, rank_position, most_recent_comment_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($aggregates as $index => $participant) {
                $insertParticipant->execute([
                    $giveaway['id'], $participant['platform'], $participant['externalUserId'],
                    hash('sha256', $participant['externalUserId']), $participant['displayName'],
                    $participant['profilePictureUrl'], $participant['commentCount'], $index + 1, $participant['mostRecentCommentAt'],
                ]);
            }
            $update = 'UPDATE giveaways SET total_comments=?, total_participants=?, last_synced_at=UTC_TIMESTAMP(), last_error=NULL';
            if ($completeAfterSync) {
                $update .= ', status="completed"';
            }
            $update .= ' WHERE id=?';
            $pdo->prepare($update)->execute([count($comments), count($aggregates), $giveaway['id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            if ($error instanceof MetaApiException && $error->authorizationFailure) {
                Meta::markReconnectIfCurrent($connection ?? ['meta_user_id' => '', 'authorization_version' => '']);
            }
            $message = $error instanceof AppException ? $error->safeMessage : 'نوێکردنەوە سەرکەوتوو نەبوو؛ داتای پێشوو پارێزرا.';
            $message = function_exists('mb_substr') ? mb_substr($message, 0, 255) : substr($message, 0, 255);
            App::db()->prepare('UPDATE giveaways SET last_error = ? WHERE id = ?')->execute([$message, $giveaway['id']]);
            throw $error;
        } finally {
            App::db()->prepare(
                'UPDATE giveaways SET sync_locked_at = NULL, sync_locked_by = NULL WHERE id = ? AND sync_locked_by = ?'
            )->execute([$giveaway['id'], $lock]);
        }
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