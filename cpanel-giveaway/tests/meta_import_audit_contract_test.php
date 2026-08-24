<?php
declare(strict_types=1);

function auditExpect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$meta = file_get_contents(__DIR__ . '/../app/Meta.php');
$giveaway = file_get_contents(__DIR__ . '/../app/Giveaway.php');
$http = file_get_contents(__DIR__ . '/../app/Http.php');
$commentImport = file_get_contents(__DIR__ . '/../app/CommentImport.php');
$cron = file_get_contents(__DIR__ . '/../cron/sync.php');
$schema = file_get_contents(__DIR__ . '/../database/schema.sql');
$dashboard = file_get_contents(__DIR__ . '/../public/assets/dashboard.js');
$live = file_get_contents(__DIR__ . '/../public/assets/live.js');

foreach (['pages_show_list', 'pages_read_engagement', 'pages_read_user_content'] as $permission) {
    auditExpect(str_contains($meta, $permission), "Missing required Facebook permission: {$permission}");
}
auditExpect(!str_contains($meta, 'pages_manage_engagement'), 'Write/manage Page engagement permission must not be requested.');
auditExpect(str_contains($meta, "'/me/permissions'"), 'A token-safe granted-permission diagnostic must exist.');
auditExpect(str_contains($http, '/api/meta/permissions'), 'The authenticated permission diagnostic route must exist.');
auditExpect(str_contains($meta, 'tokenIncluded') && str_contains($meta, 'false'), 'Permission diagnostic must explicitly omit tokens.');
auditExpect(str_contains($meta, 'rawValuesIncluded') && str_contains($meta, 'false'), 'Historical sample diagnostic must expose field presence only.');
auditExpect(str_contains($meta, 'historicalCommentSample'), 'A sanitized historical comment field-presence sample must exist.');

auditExpect(str_contains($meta, 'private const MAX_ATTEMPTS = 3'), 'Temporary Meta errors need bounded retries.');
foreach (['429', '613'] as $temporaryCode) {
    auditExpect(str_contains($meta, $temporaryCode), "Temporary Meta error {$temporaryCode} should be retried.");
}

auditExpect(str_contains($meta, 'from{id,name}'), 'Facebook history must request stable author ID and name.');
auditExpect(
    !str_contains($meta, "from{id,name,picture},parent"),
    'A profile-picture field failure must not be able to fail the historical comment request.'
);
auditExpect(str_contains($meta, "'limit' => 100"), 'Historical comment pages should request the supported large page size.');
auditExpect(str_contains($schema, 'PRIMARY KEY (giveaway_id, external_comment_hash)'), 'Comment IDs must be idempotent per giveaway.');
auditExpect(str_contains($schema, 'PRIMARY KEY (giveaway_id, platform, external_user_hash)'), 'Participants must be keyed by platform and stable author ID.');
auditExpect(str_contains($http, 'HTTP_X_HUB_SIGNATURE_256'), 'Webhook signature verification must remain enabled.');

foreach ([
    'commentsWithIdentity',
    'commentsWithoutIdentity',
    'participantsCount',
    'pagesFetched',
    'importStatus',
    'lastImportError',
] as $stat) {
    auditExpect(str_contains($giveaway, "'{$stat}'"), "Public projection is missing {$stat}.");
}

auditExpect(str_contains($schema, 'include_replies'), 'The selected top-level/replies counting rule must be persisted.');
auditExpect(str_contains($meta, "'toplevel'"), 'Facebook top-level-only mode must use the toplevel Graph filter.');
auditExpect(str_contains($meta, '$topLevelOnly && $isReply'), 'Top-level-only mode must defensively discard reply rows.');
auditExpect(str_contains($schema, 'sync_requested'), 'Signed webhooks must be able to request a fresh snapshot.');
auditExpect(str_contains($http, 'sync_requested=1'), 'A valid webhook must request a fresh snapshot.');
auditExpect(
    str_contains($commentImport, "(\$freshSnapshot && \$run['status'] === 'complete')"),
    'A completed import may restart only after an explicit fresh-snapshot request.'
);
auditExpect(
    !str_contains($commentImport, "|| \$run['status'] === 'complete'"),
    'Cron must not restart every completed historical import.'
);
auditExpect(
    str_contains($commentImport, "elseif (\$run['status'] !== 'complete')"),
    'A completed matching run must remain complete when no fresh snapshot was requested.'
);
auditExpect(str_contains($cron, 'g.sync_requested = 1'), 'Cron should restart a completed snapshot only after a signed webhook request.');
auditExpect(str_contains($dashboard, 'include-replies'), 'The admin counting-rule selector must exist.');
auditExpect(str_contains($dashboard, 'check-permissions'), 'The admin permission diagnostic button must exist.');
auditExpect(!str_contains($live, 'Business Asset User Profile Access'), 'Permission warnings must never appear on the public live screen.');
auditExpect(!str_contains($live, 'commentsWithoutIdentity'), 'Identity diagnostics must never appear on the public live screen.');

echo "Meta import audit contract tests passed\n";