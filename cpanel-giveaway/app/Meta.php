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
    private static function base(): string
    {
        return 'https://graph.facebook.com/' . rawurlencode((string) App::config('meta.graph_version'));
    }

    private static function request(string $url, string $token, ?array $post = null): array
    {
        if (!function_exists('curl_init')) {
            throw new MetaApiException('لەسەر هۆستەکە curl چالاک نییە.', 503);
        }
        $curl = curl_init($url);
        $headers = $token !== '' ? ['Authorization: Bearer ' . $token] : [];
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($post !== null) {
            curl_setopt($curl, CURLOPT_POST, true);
            curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($post, '', '&', PHP_QUERY_RFC3986));
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
            curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        }
        $body = curl_exec($curl);
        $code = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if (!is_string($body)) {
            throw new MetaApiException('پەیوەندی بە Meta سەرکەوتوو نەبوو.', 502);
        }
        $data = json_decode($body, true);
        if (!is_array($data)) {
            throw new MetaApiException('وەڵامی Meta نادروست بوو.', 502);
        }
        if ($code < 200 || $code >= 300 || isset($data['error'])) {
            $graphCode = (int) ($data['error']['code'] ?? 0);
            $graphType = (string) ($data['error']['type'] ?? '');
            $auth = in_array($graphCode, [102, 190], true) || $graphType === 'OAuthException';
            $permission = in_array($graphCode, [10, 200], true) || $graphType === 'GraphMethodException';
            if ($auth) {
                throw new MetaApiException('مۆڵەتی Meta بەسەرچووە یان پچڕاوە؛ تکایە دووبارە پەیوەستی بکەرەوە.', 401, true);
            }
            if ($permission) {
                throw new MetaApiException('Meta مۆڵەتی پێویستی نەداوە؛ تکایە دووبارە پەیوەستی بکەرەوە.', 502, true);
            }
            throw new MetaApiException($error !== '' ? 'پەیوەندی بە Meta سەرکەوتوو نەبوو.' : 'Meta هەڵەیەکی گەڕاندەوە.', 502);
        }
        return $data;
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
    private const SCOPES = 'pages_show_list,pages_read_engagement,pages_read_user_content,instagram_basic,instagram_manage_comments';
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
            'auth_type' => 'rerequest',
            'return_scopes' => 'true',
        ], '', '&', PHP_QUERY_RFC3986);
        header('Location: https://www.facebook.com/dialog/oauth?' . $query, true, 302);
        exit;
    }

    public static function callback(): never
    {
        $fail = static function (): never {
            App::redirect('/?meta=error');
        };
        if (!self::configured() || isset($_GET['error'])) {
            $fail();
        }
        $code = $_GET['code'] ?? '';
        $state = $_GET['state'] ?? '';
        if (!is_string($code) || !is_string($state) || $code === '' || !Auth::consumeOAuthState($state)) {
            $fail();
        }
        try {
            $short = Graph::postOAuth([
                'client_id' => App::config('meta.app_id'),
                'client_secret' => App::config('meta.app_secret'),
                'redirect_uri' => self::callbackUrl(),
                'code' => $code,
            ]);
            if (empty($short['access_token'])) {
                $fail();
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
                'fields' => 'id,name,access_token,picture,instagram_business_account',
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
            $igId = $allowed['instagram_business_account']['id'] ?? null;
            if (is_string($igId) && $igId !== '') {
                try {
                    $ig = Graph::get('/' . rawurlencode($igId), (string) $allowed['access_token'], [
                        'fields' => 'id,name,username,profile_picture_url',
                    ]);
                    $assets[] = [
                        'id' => $igId,
                        'platform' => 'instagram',
                        'name' => (string) ($ig['name'] ?? $ig['username'] ?? $igId),
                        'pictureUrl' => $ig['profile_picture_url'] ?? null,
                    ];
                    $tokenEntries[] = ['id' => $igId, 'token' => App::encrypt((string) $allowed['access_token'])];
                } catch (Throwable) {
                    // Facebook remains usable when an optional linked Instagram lookup fails.
                }
            }

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
        } catch (Throwable $error) {
            if (App::db()->inTransaction()) {
                App::db()->rollBack();
            }
            $fail();
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

    public static function comments(array $giveaway, array $connection): array
    {
        $token = self::assetToken($connection, $giveaway['asset_id']);
        $isInstagram = $giveaway['post_platform'] === 'instagram';
        $fields = $isInstagram ? 'id,text,timestamp,username,from{id,username}' : 'id,message,created_time,from{id,name,picture}';
        $path = '/' . rawurlencode($giveaway['post_id']) . '/comments';
        $page = Graph::get($path, $token, ['fields' => $fields, 'limit' => 100]);
        $comments = [];
        for ($pages = 0; $pages < 50; $pages++) {
            foreach (($page['data'] ?? []) as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $comment = self::normalizeCommentItem($item, $isInstagram);
                if ($comment !== null) {
                    $comments[] = $comment;
                }
            }
            $next = $page['paging']['next'] ?? null;
            if (!is_string($next) || $next === '') {
                return $comments;
            }
            if ($pages === 49) {
                throw new MetaApiException('زانیاریی کۆمێنتەکان زۆرە و بە تەواوی وەرنەگیرا؛ ڕیزبەندی نوێ نەکراوە.', 502);
            }
            $page = Graph::next($next, $token);
        }
        return $comments;
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

        return [
            'externalCommentId' => $id,
            'platform' => $isInstagram ? 'instagram' : 'facebook',
            'externalUserId' => $externalId,
            'displayName' => $displayName,
            'profilePictureUrl' => $picture,
            'text' => trim((string) ($isInstagram ? ($item['text'] ?? '') : ($item['message'] ?? ''))),
            'commentedAt' => $parsed === false ? gmdate('Y-m-d H:i:s') : gmdate('Y-m-d H:i:s', $parsed),
        ];
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