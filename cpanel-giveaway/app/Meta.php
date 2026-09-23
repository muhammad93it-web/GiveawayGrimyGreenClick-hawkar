<?php
declare(strict_types=1);

final class MetaApiException extends AppException
{
    public bool $authorizationFailure;

    public function __construct(string $message, int $status = 502, bool $authorizationFailure = false)
    {
        parent::__construct($message, $status);
        $this->authorizationFailure = $authorizationFailure;
    }
}

final class Graph
{
    private const MAX_ATTEMPTS = 3;

    private static function base(): string
    {
        return 'https://graph.facebook.com/' . rawurlencode((string) App::config('meta.graph_version'));
    }

    private static function request(string $url, string $token, ?array $post = null): array
    {
        if (!function_exists('curl_init')) {
            throw new MetaApiException('لەسەر هۆستەکە curl چالاک نییە.', 503);
        }
        $headers = $token !== '' ? ['Authorization: Bearer ' . $token] : [];
        if ($post !== null) {
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }
        $lastError = '';
        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_HTTPHEADER => $headers,
            ]);
            if ($post !== null) {
                curl_setopt($curl, CURLOPT_POST, true);
                curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($post, '', '&', PHP_QUERY_RFC3986));
            }
            $body = curl_exec($curl);
            $code = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $error = curl_error($curl);
            curl_close($curl);
            $lastError = $error;
            $data = is_string($body) ? json_decode($body, true) : null;
            if (is_array($data) && $code >= 200 && $code < 300 && !isset($data['error'])) {
                return $data;
            }
            $graphCode = is_array($data) ? (int) ($data['error']['code'] ?? 0) : 0;
            $graphType = is_array($data) ? (string) ($data['error']['type'] ?? '') : '';
            $auth = in_array($graphCode, [102, 190], true)
                || ($graphType === 'OAuthException' && $graphCode === 0);
            $permission = in_array($graphCode, [10, 200], true) || $graphType === 'GraphMethodException';
            if ($auth) {
                throw new MetaApiException('مۆڵەتی Meta بەسەرچووە یان پچڕاوە؛ تکایە دووبارە پەیوەستی بکەرەوە.', 401, true);
            }
            if ($permission) {
                throw new MetaApiException('Meta مۆڵەتی پێویستی نەداوە؛ تکایە دووبارە پەیوەستی بکەرەوە.', 502, true);
            }
            $temporary = $code === 429
                || $code >= 500
                || in_array($graphCode, [1, 2, 4, 17, 341, 613], true)
                || !is_array($data);
            if (!$temporary || $attempt === self::MAX_ATTEMPTS) {
                if (!is_array($data)) {
                    throw new MetaApiException($lastError !== '' ? 'پەیوەندی بە Meta سەرکەوتوو نەبوو.' : 'وەڵامی Meta نادروست بوو.', 502);
                }
                throw new MetaApiException('Meta هەڵەیەکی کاتی گەڕاندەوە؛ دووبارە هەوڵ بدەرەوە.', 502);
            }
            usleep(150000 * $attempt);
        }
        throw new MetaApiException('پەیوەندی بە Meta سەرکەوتوو نەبوو.', 502);
    }

    public static function get(string $path, string $token, array $query = []): array
    {
        $url = self::base() . '/' . ltrim($path, '/');
        if ($query) {
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }
        return self::request($url, $token);
    }

    public static function postOAuth(array $fields): array
    {
        $url = self::base() . '/oauth/access_token';
        return self::request($url, '', $fields);
    }

    public static function next(string $rawUrl, string $token): array
    {
        $url = parse_url($rawUrl);
        if (($url['scheme'] ?? '') !== 'https' || ($url['host'] ?? '') !== 'graph.facebook.com') {
            throw new MetaApiException('زانیاریی کۆمێنتەکان تەواو نەگەیشت؛ دووبارە هەوڵ بدەرەوە.', 502);
        }
        parse_str($url['query'] ?? '', $query);
        unset($query['access_token']);
        $safe = 'https://graph.facebook.com' . ($url['path'] ?? '') . ($query ? '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986) : '');
        return self::request($safe, $token);
    }
}

final class Meta
{
    // The current App Review covers Facebook Page permissions only.
    private const SCOPES = 'pages_show_list,pages_read_engagement,pages_read_user_content';
    private const ANONYMOUS_DISPLAY_NAME = 'بێ ناو';

    public static function configured(): bool
    {
        foreach (['app_id', 'app_secret', 'allowed_page_id'] as $key) {
            $value = (string) App::config('meta.' . $key);
            if ($value === '' || in_array($value, ['META_APP_ID', 'META_APP_SECRET', 'FACEBOOK_PAGE_ID'], true)) {
                return false;
            }
        }
        return true;
    }

    public static function callbackUrl(): string
    {
        $configured = trim((string) App::config('meta.redirect_uri'));
        return $configured !== '' ? $configured : App::url('/api/meta/callback');
    }

    public static function connection(string $metaUserId): ?array
    {
        $statement = App::db()->prepare('SELECT * FROM meta_connections WHERE meta_user_id = ?');
        $statement->execute([$metaUserId]);
        return $statement->fetch() ?: null;
    }

    public static function status(): array
    {
        $userId = Auth::userId();
        $connection = $userId ? self::connection($userId) : null;
        if ($connection) {
            self::refreshHealthIfDue($connection);
            $connection = self::connection($userId);
        }
        return [
            'configured' => self::configured(),
            'connected' => $connection !== null,
            'adminName' => $connection['admin_name'] ?? null,
            'callbackUrl' => self::callbackUrl(),
            'csrfToken' => Auth::csrfToken(),
            'tokenStatus' => $connection['token_status'] ?? 'unknown',
            'tokenExpiresAt' => App::iso($connection['token_expires_at'] ?? null),
            'tokenCheckedAt' => App::iso($connection['token_checked_at'] ?? null),
        ];
    }

    /**
     * Return permission states only; never return or log a token.
     */
    public static function permissions(string $userId, ?array $giveaway = null): array
    {
        $connection = self::connection($userId);
        if (!$connection) {
            throw new AppException('چوونەژوورەوە پێویستە.', 401);
        }
        $requested = array_values(array_filter(array_map('trim', explode(',', self::SCOPES))));
        $granted = [];
        $declined = [];
        $expired = [];
        try {
            $token = App::decrypt($connection['encrypted_long_lived_token']);
            $response = Graph::get('/me/permissions', $token, ['limit' => 100]);
            foreach (($response['data'] ?? []) as $permission) {
                if (!is_array($permission)) {
                    continue;
                }
                $name = self::nonEmptyString($permission['permission'] ?? null);
                $status = self::nonEmptyString($permission['status'] ?? null);
                if ($name === null) {
                    continue;
                }
                if ($status === 'granted') {
                    $granted[] = $name;
                } elseif ($status === 'expired') {
                    $expired[] = $name;
                } else {
                    $declined[] = $name;
                }
            }
        } catch (MetaApiException $error) {
            throw $error;
        } catch (Throwable) {
            throw new AppException('مۆڵەتەکانی Meta لە ئێستادا پشکنین نەکران.', 502);
        }
        $historicalSample = null;
        if ($giveaway && ($giveaway['post_platform'] ?? '') === 'facebook') {
            $pageToken = self::assetToken($connection, (string) $giveaway['asset_id']);
            $page = Graph::get('/' . rawurlencode((string) $giveaway['post_id']) . '/comments', $pageToken, [
                'fields' => 'id,message,created_time,from{id,name}',
                'limit' => 1,
                'filter' => 'stream',
            ]);
            $item = is_array($page['data'][0] ?? null) ? $page['data'][0] : null;
            $from = $item !== null && is_array($item['from'] ?? null) ? $item['from'] : null;
            $historicalSample = [
                'commentReturned' => $item !== null,
                'idPresent' => $item !== null && self::nonEmptyString($item['id'] ?? null) !== null,
                'messageFieldPresent' => $item !== null && array_key_exists('message', $item),
                'createdTimePresent' => $item !== null && self::nonEmptyString($item['created_time'] ?? null) !== null,
                'fromPresent' => $from !== null,
                'fromIdPresent' => $from !== null && self::nonEmptyString($from['id'] ?? null) !== null,
                'fromNamePresent' => $from !== null && self::nonEmptyString($from['name'] ?? null) !== null,
                'nextPagePresent' => self::nonEmptyString($page['paging']['next'] ?? null) !== null,
                'rawValuesIncluded' => false,
            ];
        }
        return [
            'requested' => $requested,
            'granted' => array_values(array_unique($granted)),
            'declined' => array_values(array_unique($declined)),
            'expired' => array_values(array_unique($expired)),
            'pageCommentAccess' => in_array('pages_read_engagement', $granted, true)
                && in_array('pages_read_user_content', $granted, true) ? 'granted' : 'incomplete',
            'businessAssetUserProfileAccess' => 'not_verifiable_by_permissions_endpoint',
            'tokenTypeForComments' => 'page_access_token',
            'tokenIncluded' => false,
            'historicalCommentSample' => $historicalSample,
        ];
    }

    private static function refreshHealthIfDue(array $connection): void
    {
        $checkedAt = $connection['token_checked_at'] ? strtotime($connection['token_checked_at'] . ' UTC') : 0;
        if ($checkedAt && time() - $checkedAt < 600) {
            return;
        }
        try {
            $userToken = App::decrypt($connection['encrypted_long_lived_token']);
            Graph::get('/me', $userToken, ['fields' => 'id']);
            $tokens = json_decode(App::decrypt($connection['encrypted_page_tokens_json']), true) ?: [];
            foreach ($tokens as $entry) {
                Graph::get('/' . rawurlencode($entry['id']), App::decrypt($entry['token']), ['fields' => 'id']);
            }
            $expires = $connection['token_expires_at'] ? strtotime($connection['token_expires_at'] . ' UTC') : null;
            $status = $expires && $expires <= time() ? 'expired' : (($expires && $expires - time() <= 604800) ? 'expiring' : 'active');
            App::db()->prepare(
                'UPDATE meta_connections SET token_status = ?, token_checked_at = UTC_TIMESTAMP() WHERE meta_user_id = ? AND authorization_version = ?'
            )->execute([$status, $connection['meta_user_id'], $connection['authorization_version']]);
        } catch (MetaApiException $exception) {
            if ($exception->authorizationFailure) {
                App::db()->prepare(
                    'UPDATE meta_connections SET token_status = ?, token_checked_at = UTC_TIMESTAMP() WHERE meta_user_id = ? AND authorization_version = ?'
                )->execute(['reconnect_required', $connection['meta_user_id'], $connection['authorization_version']]);
            }
            // Temporary network/API issues deliberately retain prior health.
        } catch (Throwable) {
            // Corrupt/old credentials are not exposed and are left for a reconnect.
        }
    }

    public static function login(): never
    {
        if (!self::configured()) {
            throw new AppException('ڕێکخستنی Meta تەواو نەکراوە.', 503);
        }
        $state = Auth::beginOAuthState();
        $query = http_build_query([
            'client_id' => App::config('meta.app_id'),
            'redirect_uri' => self::callbackUrl(),
            'scope' => self::SCOPES,
            'state' => $state,
            'response_type' => 'code',
            // Ask again for permissions previously declined; this does not force password re-entry.
            'auth_type' => 'rerequest',
            'return_scopes' => 'true',
        ], '', '&', PHP_QUERY_RFC3986);
        header('Location: https://www.facebook.com/dialog/oauth?' . $query, true, 302);
        exit;
    }

    public static function callback(): never
    {
        $fail = static function (string $reason): never {
            App::redirect('/?meta=' . rawurlencode($reason));
        };
        if (!self::configured()) {
            $fail('configuration');
        }
        if (isset($_GET['error'])) {
            $fail('cancelled');
        }
        $code = $_GET['code'] ?? '';
        $state = $_GET['state'] ?? '';
        if (!is_string($code) || $code === '' || !is_string($state) || $state === '') {
            $fail('invalid_response');
        }
        if (!Auth::consumeOAuthState($state)) {
            $fail('expired_state');
        }
        try {
            $short = Graph::postOAuth([
                'client_id' => App::config('meta.app_id'),
                'client_secret' => App::config('meta.app_secret'),
                'redirect_uri' => self::callbackUrl(),
                'code' => $code,
            ]);
            if (empty($short['access_token'])) {
                $fail('token_exchange');
            }
            $grant = Graph::postOAuth([
                'grant_type' => 'fb_exchange_token',
                'client_id' => App::config('meta.app_id'),
                'client_secret' => App::config('meta.app_secret'),
                'fb_exchange_token' => $short['access_token'],
            ]);
            $longToken = (string) ($grant['access_token'] ?? $short['access_token']);
            $expiresSeconds = (int) ($grant['expires_in'] ?? $short['expires_in'] ?? 0);
            $me = Graph::get('/me', $longToken, ['fields' => 'id,name']);
            $accountPage = Graph::get('/me/accounts', $longToken, [
                'fields' => 'id,name,access_token,picture',
                'limit' => 100,
            ]);
            $allowed = null;
            for ($pagesRead = 0; $pagesRead < 50; $pagesRead++) {
                foreach (($accountPage['data'] ?? []) as $page) {
                    if (($page['id'] ?? '') === App::config('meta.allowed_page_id') && !empty($page['access_token'])) {
                        $allowed = $page;
                        break 2;
                    }
                }
                $next = $accountPage['paging']['next'] ?? null;
                if (!is_string($next) || $next === '') {
                    break;
                }
                if ($pagesRead === 49) {
                    throw new AppException('لیستی پەیجەکانی Meta تەواو وەرنەگیرا؛ دووبارە هەوڵ بدەرەوە.', 502);
                }
                $accountPage = Graph::next($next, $longToken);
            }
            if (!$allowed) {
                throw new AppException('ئەو هەژمارە دەسەڵاتی پەیجی ڕێگەپێدراوی نییە.', 403);
            }

            $assets = [[
                'id' => (string) $allowed['id'],
                'platform' => 'facebook',
                'name' => (string) ($allowed['name'] ?? $allowed['id']),
                'pictureUrl' => $allowed['picture']['data']['url'] ?? null,
            ]];
            $tokenEntries = [[
                'id' => (string) $allowed['id'],
                'token' => App::encrypt((string) $allowed['access_token']),
            ]];
            $pdo = App::db();
            $pdo->beginTransaction();
            $existing = $pdo->query('SELECT meta_user_id FROM meta_connections WHERE singleton_key = "default" FOR UPDATE')->fetch();
            $userId = (string) ($me['id'] ?? '');
            if ($userId === '') {
                throw new AppException('ناسنامەی بەڕێوەبەر لە Meta وەرنەگیرا.', 502);
            }
            if ($existing && $existing['meta_user_id'] !== $userId) {
                throw new AppException('پەیوەندییەکی Meta ـی دیکە پێشتر هەیە. سەرەتا پچڕاندنی بکە.', 409);
            }
            $version = App::uuid();
            $expiry = $expiresSeconds > 0 ? gmdate('Y-m-d H:i:s', time() + $expiresSeconds) : null;
            if ($existing) {
                $statement = $pdo->prepare(
                    'UPDATE meta_connections SET admin_name=?, encrypted_user_token=?, encrypted_long_lived_token=?, encrypted_page_tokens_json=?, assets_json=?, token_status=?, token_expires_at=?, token_checked_at=UTC_TIMESTAMP(), authorization_version=? WHERE meta_user_id=?'
                );
                $statement->execute([
                    (string) ($me['name'] ?? 'بەڕێوەبەر'),
                    App::encrypt((string) $short['access_token']),
                    App::encrypt($longToken),
                    App::encrypt((string) json_encode($tokenEntries, JSON_UNESCAPED_SLASHES)),
                    json_encode($assets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'active', $expiry, $version, $userId,
                ]);
            } else {
                $statement = $pdo->prepare(
                    'INSERT INTO meta_connections (meta_user_id, singleton_key, admin_name, encrypted_user_token, encrypted_long_lived_token, encrypted_page_tokens_json, assets_json, token_status, token_expires_at, token_checked_at, authorization_version) VALUES (?, "default", ?, ?, ?, ?, ?, "active", ?, UTC_TIMESTAMP(), ?)'
                );
                $statement->execute([
                    $userId, (string) ($me['name'] ?? 'بەڕێوەبەر'),
                    App::encrypt((string) $short['access_token']), App::encrypt($longToken),
                    App::encrypt((string) json_encode($tokenEntries, JSON_UNESCAPED_SLASHES)),
                    json_encode($assets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $expiry, $version,
                ]);
            }
            $pdo->commit();
            Auth::create($userId);
            App::redirect('/?meta=connected');
        } catch (MetaApiException $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            $fail($error->authorizationFailure ? 'authorization' : 'meta_api');
        } catch (AppException $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            $fail($error->status === 403 ? 'page_access' : 'server');
        } catch (Throwable $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            $fail('server');
        }
    }

    public static function assets(string $userId): array
    {
        $connection = self::connection($userId);
        if (!$connection) {
            throw new AppException('چوونەژوورەوە پێویستە.', 401);
        }
        $assets = json_decode($connection['assets_json'], true);
        return is_array($assets) ? $assets : [];
    }

    private static function assetToken(array $connection, string $assetId): string
    {
        $tokens = json_decode(App::decrypt($connection['encrypted_page_tokens_json']), true);
        foreach ($tokens ?: [] as $entry) {
            if (($entry['id'] ?? '') === $assetId) {
                return App::decrypt((string) $entry['token']);
            }
        }
        throw new AppException('پەیج یان هەژمارە هەڵبژێردراوەکە ڕێگەپێنەدراوە.', 403);
    }

    public static function asset(string $userId, string $assetId): array
    {
        foreach (self::assets($userId) as $asset) {
            if (($asset['id'] ?? '') === $assetId) {
                return $asset;
            }
        }
        throw new AppException('پەیج یان هەژمارە هەڵبژێردراوەکە ڕێگەپێنەدراوە.', 403);
    }

    public static function posts(string $userId, string $assetId): array
    {
        $asset = self::asset($userId, $assetId);
        $connection = self::connection($userId);
        $token = self::assetToken($connection, $assetId);
        if ($asset['platform'] === 'instagram') {
            $data = Graph::get('/' . rawurlencode($assetId) . '/media', $token, [
                'fields' => 'id,caption,timestamp,permalink,thumbnail_url,media_url',
                'limit' => 25,
            ]);
            return array_map(static fn(array $item) => [
                'id' => (string) $item['id'],
                'platform' => 'instagram',
                'message' => $item['caption'] ?? null,
                'createdAt' => $item['timestamp'] ?? '',
                'permalinkUrl' => $item['permalink'] ?? null,
                'thumbnailUrl' => $item['thumbnail_url'] ?? ($item['media_url'] ?? null),
            ], $data['data'] ?? []);
        }
        $data = Graph::get('/' . rawurlencode($assetId) . '/posts', $token, [
            'fields' => 'id,message,story,created_time,permalink_url,full_picture',
            'limit' => 25,
        ]);
        return array_map(static fn(array $item) => [
            'id' => (string) $item['id'],
            'platform' => 'facebook',
            'message' => $item['message'] ?? ($item['story'] ?? null),
            'createdAt' => $item['created_time'] ?? '',
            'permalinkUrl' => $item['permalink_url'] ?? null,
            'thumbnailUrl' => $item['full_picture'] ?? null,
        ], $data['data'] ?? []);
    }

    public static function post(string $userId, string $assetId, string $postId): array
    {
        foreach (self::posts($userId, $assetId) as $post) {
            if ($post['id'] === $postId) {
                return $post;
            }
        }
        throw new AppException('پۆستە هەڵبژێردراوەکە لەسەر ئەم پەیجە یان هەژمارە نییە.', 403);
    }

    public static function commentPage(array $giveaway, array $connection, ?string $after = null): array
    {
        $token = self::assetToken($connection, $giveaway['asset_id']);
        $isInstagram = $giveaway['post_platform'] === 'instagram';
        $includeReplies = !array_key_exists('include_replies', $giveaway)
            || (int) $giveaway['include_replies'] === 1;
        $fields = $isInstagram
            ? 'id,text,timestamp,username,from{id,username},replies.limit(100){id,text,timestamp,username,from{id,username}}'
            : 'id,message,created_time,from{id,name},parent{id},comment_count'
                . ($includeReplies ? ',comments.limit(100){id,message,created_time,from{id,name},parent{id}}' : '');
        $path = '/' . rawurlencode($giveaway['post_id']) . '/comments';
        $query = ['fields' => $fields, 'limit' => 100];
        if (!$isInstagram) {
            $query['filter'] = $includeReplies ? 'stream' : 'toplevel';
        }
        if ($after !== null && $after !== '') {
            $query['after'] = $after;
        }
        return self::normalizeCommentPage(
            Graph::get($path, $token, $query),
            $isInstagram,
            $includeReplies,
            !$includeReplies
        );
    }

    public static function replyPage(
        array $giveaway,
        array $connection,
        string $parentCommentId,
        ?string $after = null
    ): array {
        $token = self::assetToken($connection, $giveaway['asset_id']);
        $isInstagram = $giveaway['post_platform'] === 'instagram';
        $fields = $isInstagram
            ? 'id,text,timestamp,username,from{id,username}'
            : 'id,message,created_time,from{id,name},parent{id}';
        $path = '/' . rawurlencode($parentCommentId) . ($isInstagram ? '/replies' : '/comments');
        $query = ['fields' => $fields, 'limit' => 100];
        if (!$isInstagram) {
            $query['filter'] = 'stream';
        }
        if ($after !== null && $after !== '') {
            $query['after'] = $after;
        }
        $page = Graph::get($path, $token, $query);
        foreach (($page['data'] ?? []) as &$item) {
            if (is_array($item) && !isset($item['parent'])) {
                $item['parent'] = ['id' => $parentCommentId];
            }
        }
        unset($item);
        return self::normalizeCommentPage($page, $isInstagram, false);
    }

    /**
     * Normalize one Graph page and its first embedded reply page.
     *
     * Only opaque paging cursors are returned. A Graph next URL (which can
     * contain a token) is never persisted.
     */
    public static function normalizeCommentPage(
        array $page,
        bool $isInstagram,
        bool $includeEmbeddedReplies = true,
        bool $topLevelOnly = false
    ): array {
        $comments = [];
        $replyEdge = $isInstagram ? 'replies' : 'comments';
        foreach (($page['data'] ?? []) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $comment = self::normalizeCommentItem($item, $isInstagram);
            if ($comment === null) {
                continue;
            }
            $isReply = $comment['parentCommentId'] !== null;
            if ($topLevelOnly && $isReply) {
                continue;
            }
            $comment['isReply'] = $isReply;
            $comment['repliesComplete'] = true;
            $comment['replyAfter'] = null;

            if ($includeEmbeddedReplies && !$isReply) {
                $edgeWasReturned = isset($item[$replyEdge]) && is_array($item[$replyEdge]);
                $edge = $edgeWasReturned ? $item[$replyEdge] : [];
                $embedded = is_array($edge['data'] ?? null) ? $edge['data'] : [];
                $replyAfter = self::nextCursor($edge);
                $hasReplyCount = array_key_exists('comment_count', $item)
                    && is_numeric($item['comment_count']);
                $knownReplyCount = max(0, (int) ($item['comment_count'] ?? count($embedded)));
                $comment['repliesComplete'] = $replyAfter === null && (
                    ($hasReplyCount && $knownReplyCount === 0)
                    || ($edgeWasReturned && $knownReplyCount <= count($embedded))
                );
                $comment['replyAfter'] = $replyAfter;

                foreach ($embedded as $replyItem) {
                    if (!is_array($replyItem)) {
                        continue;
                    }
                    if (!isset($replyItem['parent'])) {
                        $replyItem['parent'] = ['id' => $comment['externalCommentId']];
                    }
                    $reply = self::normalizeCommentItem($replyItem, $isInstagram);
                    if ($reply !== null) {
                        $reply['isReply'] = true;
                        $reply['repliesComplete'] = true;
                        $reply['replyAfter'] = null;
                        $comments[$reply['externalCommentId']] = $reply;
                    }
                }
            }
            $comments[$comment['externalCommentId']] = $comment;
        }

        return [
            'comments' => array_values($comments),
            'nextAfter' => self::nextCursor($page),
        ];
    }

    /**
     * Normalize one Graph comment without inventing an author identity.
     *
     * This method is public so the privacy and aggregation behavior can be
     * covered by a small, dependency-free regression test.
     */
    public static function normalizeCommentItem(array $item, bool $isInstagram): ?array
    {
        $id = self::nonEmptyString($item['id'] ?? null);
        if ($id === null) {
            return null;
        }

        $from = is_array($item['from'] ?? null) ? $item['from'] : null;
        $authorId = self::nonEmptyString($from['id'] ?? null);
        $externalId = $authorId ?? ('anonymous:' . $id);

        $displayName = $isInstagram
            ? self::nonEmptyString($from['username'] ?? ($item['username'] ?? null))
            : self::nonEmptyString($from['name'] ?? null);
        $displayName ??= self::ANONYMOUS_DISPLAY_NAME;

        $picture = null;
        if ($from !== null) {
            $nestedPicture = is_array($from['picture'] ?? null) ? $from['picture'] : [];
            $pictureData = is_array($nestedPicture['data'] ?? null) ? $nestedPicture['data'] : [];
            $picture = self::safeImageUrl($pictureData['url'] ?? ($nestedPicture['url'] ?? null));
            // Some legitimate Meta payloads can already include this field,
            // even though the current IG comment edge does not document it.
            $picture ??= self::safeImageUrl($from['profile_picture_url'] ?? null);
        }

        $time = $isInstagram ? ($item['timestamp'] ?? '') : ($item['created_time'] ?? '');
        $parsed = strtotime((string) $time);
        $parent = is_array($item['parent'] ?? null) ? $item['parent'] : [];
        $parentId = self::nonEmptyString($parent['id'] ?? null);

        return [
            'externalCommentId' => $id,
            'platform' => $isInstagram ? 'instagram' : 'facebook',
            'externalUserId' => $externalId,
            'displayName' => $displayName,
            'profilePictureUrl' => $picture,
            'text' => trim((string) ($isInstagram ? ($item['text'] ?? '') : ($item['message'] ?? ''))),
            'commentedAt' => $parsed === false ? gmdate('Y-m-d H:i:s') : gmdate('Y-m-d H:i:s', $parsed),
            'parentCommentId' => $parentId,
        ];
    }

    private static function nextCursor(array $page): ?string
    {
        $next = self::nonEmptyString($page['paging']['next'] ?? null);
        if ($next === null) {
            return null;
        }
        $cursor = self::nonEmptyString($page['paging']['cursors']['after'] ?? null);
        if ($cursor === null) {
            $parts = parse_url($next);
            parse_str((string) ($parts['query'] ?? ''), $query);
            $cursor = self::nonEmptyString($query['after'] ?? null);
        }
        if ($cursor === null || strlen($cursor) > 8192) {
            throw new MetaApiException('نیشانەی بەردەوامبوونی کۆمێنتەکان نادروستە.', 502);
        }
        return $cursor;
    }

    private static function nonEmptyString(mixed $value): ?string
    {
        if (!is_string($value) && !is_int($value)) {
            return null;
        }
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    private static function safeImageUrl(mixed $value): ?string
    {
        $url = self::nonEmptyString($value);
        if ($url === null) {
            return null;
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https'], true) ? $url : null;
    }

    public static function markReconnectIfCurrent(array $connection): void
    {
        App::db()->prepare(
            'UPDATE meta_connections SET token_status = "reconnect_required", token_checked_at = UTC_TIMESTAMP() WHERE meta_user_id = ? AND authorization_version = ?'
        )->execute([$connection['meta_user_id'], $connection['authorization_version']]);
    }
}
