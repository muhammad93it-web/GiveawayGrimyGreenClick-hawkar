<?php
declare(strict_types=1);

if (!class_exists('AppException')) {
    class AppException extends RuntimeException
    {
        public string $safeMessage;
        public int $httpStatus;

        public function __construct(string $safeMessage, int $httpStatus = 400)
        {
            parent::__construct($safeMessage);
            $this->safeMessage = $safeMessage;
            $this->httpStatus = $httpStatus;
        }
    }
}

require __DIR__ . '/../app/Meta.php';

function importExpect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

// More than the old 50-page ceiling must remain processable page by page.
$seen = [];
$lastCursor = null;
for ($pageNumber = 0; $pageNumber < 60; $pageNumber++) {
    $items = [];
    for ($itemNumber = 0; $itemNumber < 100; $itemNumber++) {
        $id = 'comment-' . $pageNumber . '-' . $itemNumber;
        $items[] = [
            'id' => $id,
            'message' => 'کۆمێنت',
            'created_time' => '2026-08-20T12:00:00+0000',
            'comment_count' => 0,
            'comments' => ['data' => []],
        ];
    }
    $graphPage = ['data' => $items];
    if ($pageNumber < 59) {
        $cursor = 'cursor-' . ($pageNumber + 1);
        $graphPage['paging'] = [
            'next' => 'https://graph.facebook.com/v26.0/post/comments?after=' . $cursor
                . '&access_token=must-not-be-stored',
            'cursors' => ['after' => $cursor],
        ];
    }
    $normalized = Meta::normalizeCommentPage($graphPage, false);
    foreach ($normalized['comments'] as $comment) {
        $seen[$comment['externalCommentId']] = true;
    }
    $lastCursor = $normalized['nextAfter'];
}
importExpect(count($seen) === 6000, 'Sixty pages should normalize without the old 5,000-comment ceiling.');
importExpect($lastCursor === null, 'The final page should terminate paging.');

$metaSource = file_get_contents(__DIR__ . '/../app/Meta.php');
$giveawaySource = file_get_contents(__DIR__ . '/../app/Giveaway.php');
$schema = file_get_contents(__DIR__ . '/../database/schema.sql');
importExpect(!str_contains($metaSource, '$pages < 50'), 'The fixed fifty-page guard must not return.');
importExpect(
    str_contains($giveawaySource, 'if (!$complete)') && str_contains($giveawaySource, 'status="running"'),
    'An unfinished manual import must become eligible for cron continuation.'
);
importExpect(
    str_contains($schema, 'comment_import_runs') && str_contains($schema, 'comment_import_staging'),
    'Resumable cursor state and protected staging tables must exist.'
);

echo "historical import contract tests passed\n";