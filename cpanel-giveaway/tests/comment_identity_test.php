<?php
declare(strict_types=1);

class AppException extends RuntimeException
{
    public function __construct(
        public readonly string $safeMessage = '',
        public readonly int $status = 500
    ) {
        parent::__construct($safeMessage);
    }
}

require_once __DIR__ . '/../app/Meta.php';
require_once __DIR__ . '/../app/Giveaway.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$facebook = Meta::normalizeCommentItem([
    'id' => 'comment-1',
    'message' => 'سڵاو',
    'created_time' => '2026-08-23T12:00:00+0000',
    'from' => [
        'id' => 'person-1',
        'name' => 'کۆمێنتنووسی یەکەم',
        'picture' => ['data' => ['url' => 'https://example.com/person-1.jpg']],
    ],
], false);
expect($facebook !== null, 'Facebook comment should normalize.');
expect($facebook['externalUserId'] === 'person-1', 'Facebook author ID should be preserved.');
expect($facebook['displayName'] === 'کۆمێنتنووسی یەکەم', 'Facebook author name should be preserved.');
expect($facebook['profilePictureUrl'] === 'https://example.com/person-1.jpg', 'Facebook profile photo should be preserved.');

$anonymousOne = Meta::normalizeCommentItem([
    'id' => 'anonymous-comment-1',
    'message' => 'یەک',
    'created_time' => '2026-08-23T12:01:00+0000',
], false);
$anonymousTwo = Meta::normalizeCommentItem([
    'id' => 'anonymous-comment-2',
    'message' => 'دوو',
    'created_time' => '2026-08-23T12:02:00+0000',
], false);
expect($anonymousOne['externalUserId'] !== $anonymousTwo['externalUserId'], 'Anonymous comments must never be merged.');
expect($anonymousOne['displayName'] === 'بێ ناو', 'Missing Facebook author should use the privacy-safe label.');

$instagramWithUsernameOnly = Meta::normalizeCommentItem([
    'id' => 'ig-comment-1',
    'text' => 'سڵاو',
    'timestamp' => '2026-08-23T12:03:00+0000',
    'username' => 'returned_username',
], true);
expect($instagramWithUsernameOnly['displayName'] === 'returned_username', 'A returned Instagram username should be displayed.');
expect(str_starts_with($instagramWithUsernameOnly['externalUserId'], 'anonymous:'), 'Username alone must not be treated as a stable identity.');

$comments = [
    [
        'externalCommentId' => 'comment-a',
        'platform' => 'facebook',
        'externalUserId' => 'person-2',
        'displayName' => 'بێ ناو',
        'profilePictureUrl' => null,
        'text' => '',
        'commentedAt' => '2026-08-23 12:00:00',
    ],
    [
        'externalCommentId' => 'comment-b',
        'platform' => 'facebook',
        'externalUserId' => 'person-2',
        'displayName' => 'ناوی تەواو',
        'profilePictureUrl' => 'https://example.com/person-2.jpg',
        'text' => '',
        'commentedAt' => '2026-08-23 12:05:00',
    ],
    $anonymousOne,
    $anonymousTwo,
];
$aggregates = Giveaway::aggregateComments($comments);
expect(count($aggregates) === 3, 'One identified person and two anonymous comments should produce three rows.');
expect($aggregates[0]['externalUserId'] === 'person-2', 'The identified person with two comments should rank first.');
expect($aggregates[0]['commentCount'] === 2, 'Comments with the same stable ID should be counted together.');
expect($aggregates[0]['displayName'] === 'ناوی تەواو', 'Later non-anonymous name should improve the aggregate.');
expect($aggregates[0]['profilePictureUrl'] === 'https://example.com/person-2.jpg', 'Later profile photo should improve the aggregate.');

$invalidImage = Meta::normalizeCommentItem([
    'id' => 'comment-unsafe-image',
    'created_time' => '2026-08-23T12:06:00+0000',
    'from' => [
        'id' => 'person-3',
        'name' => 'کەسی سێیەم',
        'picture' => ['data' => ['url' => 'javascript:alert(1)']],
    ],
], false);
expect($invalidImage['profilePictureUrl'] === null, 'Unsafe profile-photo schemes must be rejected.');

$projectionSqlMethod = new ReflectionMethod(Giveaway::class, 'identifiedParticipantsSql');
$projectionSql = $projectionSqlMethod->invoke(null);
expect(
    str_contains($projectionSql, "external_user_id NOT LIKE 'anonymous:%'"),
    'Participant projection must exclude anonymous rows before applying its limit.'
);
expect(
    strpos($projectionSql, "external_user_id NOT LIKE 'anonymous:%'") < strpos($projectionSql, 'LIMIT 50'),
    'Anonymous filtering must happen before the participant limit.'
);
expect(
    str_contains($projectionSql, 'ORDER BY comment_count DESC'),
    'Identified participants must be ranked by aggregated comment count.'
);

echo "comment identity tests passed\n";