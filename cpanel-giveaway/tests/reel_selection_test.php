<?php
declare(strict_types=1);

class AppException extends RuntimeException
{
    public function __construct(public readonly string $safeMessage = '', public readonly int $status = 500)
    {
        parent::__construct($safeMessage);
    }
}

require_once __DIR__ . '/../app/Meta.php';

function reelExpect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$id = '1367904922112644';
reelExpect(Meta::reelIdFromUrl('https://www.facebook.com/reel/' . $id) === $id, 'Valid Reel URL must resolve to its numeric video ID.');
foreach ([
    'http://www.facebook.com/reel/' . $id,
    'https://facebook.com.evil.example/reel/' . $id,
    'https://www.facebook.com@evil.example/reel/' . $id,
    'https://www.facebook.com/reel/not-an-id',
    'https://www.facebook.com/reel/' . $id . '/comments',
] as $badUrl) {
    try {
        Meta::reelIdFromUrl($badUrl);
        throw new RuntimeException('Untrusted Reel URL was accepted.');
    } catch (AppException $error) {
        reelExpect($error->status === 400, 'Invalid Reel URL must be rejected.');
    }
}

$owner = ['id' => $id, 'from' => ['id' => 'page-1']];
reelExpect(Meta::videoBelongsToPage($owner, $id, 'page-1'), 'Exact Graph video and Page owner must match.');
reelExpect(!Meta::videoBelongsToPage($owner, $id, 'page-2'), 'Another Page must be rejected.');
reelExpect(!Meta::videoBelongsToPage($owner, 'other-video', 'page-1'), 'Another video must be rejected.');
reelExpect(!Meta::videoBelongsToPage(['id' => $id], $id, 'page-1'), 'Missing Graph owner must fail closed.');

echo "Reel URL and ownership tests passed\n";
