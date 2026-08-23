<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$publicRoot = realpath(__DIR__ . '/../public');
$staticFile = $publicRoot . $path;
if ($path !== '/' && is_file($staticFile)) {
    return false;
}

if (str_starts_with($path, '/api/')) {
    header('Content-Type: application/json; charset=utf-8');
    $payload = match (true) {
        $path === '/api/meta/status' => [
            'configured' => true,
            'connected' => true,
            'csrfToken' => 'fixture-token',
            'adminName' => 'بەڕێوەبەری تاقیکردنەوە',
            'tokenStatus' => 'active',
            'callbackUrl' => 'https://giveaway.example.com/api/meta/callback',
        ],
        $path === '/api/meta/assets' => [[
            'id' => 'page-1',
            'name' => 'پەیجی تاقیکردنەوە',
            'platform' => 'facebook',
        ]],
        preg_match('#^/api/meta/assets/[^/]+/posts$#', $path) === 1 => [[
            'id' => 'post-1',
            'message' => 'پۆستی تاقیکردنەوە',
            'createdAt' => '2026-08-23T12:00:00+00:00',
        ]],
        $path === '/api/giveaways/current' => [
            'exists' => true,
            'id' => 'giveaway-fixture',
            'status' => 'running',
            'assetId' => 'page-1',
            'postId' => 'post-1',
            'postPlatform' => 'facebook',
            'prizeCount' => 2,
            'prizeTitle' => 'خەڵاتی تاقیکردنەوە',
            'totalComments' => 5,
            'totalParticipants' => 4,
            'lastSyncedAt' => '2026-08-23T12:05:00+00:00',
            'lastError' => null,
            'commentImport' => [
                'status' => 'running',
                'phase' => 'top_level',
                'pageCount' => 2,
                'fetchedComments' => 5,
                'startedAt' => '2026-08-23T12:04:00+00:00',
                'completedAt' => null,
                'lastError' => null,
                'completionRequested' => false,
                'migrationRequired' => false,
            ],
            'identityCoverage' => [
                'identifiedComments' => 2,
                'anonymousComments' => 3,
                'identifiedParticipants' => 1,
                'anonymousEntries' => 3,
            ],
            'participants' => [
                [
                    'participantKey' => 'identified-fixture',
                    'displayName' => 'بەشداربووی ناسنامەدار',
                    'profilePictureUrl' => null,
                    'commentCount' => 2,
                    'rank' => 1,
                    'identityAvailable' => true,
                ],
            ],
        ],
        default => ['error' => 'fixture route not found'],
    };
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$fixtureConfig = sys_get_temp_dir() . '/comment-champions-ui-fixture-config.php';
if (!is_file($fixtureConfig)) {
    file_put_contents($fixtureConfig, <<<'PHP'
<?php
return [
    'app_url' => 'https://localhost',
    'app_key' => 'fixture-key-that-is-longer-than-thirty-two-characters',
    'db' => [
        'host' => 'localhost',
        'name' => 'fixture',
        'user' => 'fixture',
        'password' => '',
    ],
    'meta' => [],
];
PHP);
}
putenv('APP_CONFIG_FILE=' . $fixtureConfig);
require __DIR__ . '/../public/index.php';