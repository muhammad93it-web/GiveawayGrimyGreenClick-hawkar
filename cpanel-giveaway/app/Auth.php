<?php
declare(strict_types=1);

final class Auth
{
    private const SESSION_COOKIE = 'sid';
    private const CSRF_COOKIE = 'csrf';
    private const OAUTH_STATE_COOKIE = 'meta_oauth_state';
    private static ?string $userId = null;
    private static bool $loaded = false;

    private static function cookieOptions(int $expires): array
    {
        return [
            'expires' => $expires,
            'path' => '/',
            'secure' => App::secureCookies(),
            'httponly' => true,
            'samesite' => 'Lax',
        ];
    }

    public static function userId(): ?string
    {
        if (self::$loaded) {
            return self::$userId;
        }
        self::$loaded = true;
        $token = $_COOKIE[self::SESSION_COOKIE] ?? '';
        if (!is_string($token) || $token === '') {
            return null;
        }
        $statement = App::db()->prepare(
            'SELECT meta_user_id FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()'
        );
        $statement->execute([hash('sha256', $token)]);
        $row = $statement->fetch();
        self::$userId = $row['meta_user_id'] ?? null;
        return self::$userId;
    }

    public static function requireUser(): string
    {
        $user = self::userId();
        if (!$user) {
            throw new AppException('چوونەژوورەوە پێویستە.', 401);
        }
        return $user;
    }

    public static function create(string $metaUserId): void
    {
        $token = App::randomToken(32);
        $expires = time() + 30 * 24 * 60 * 60;
        $statement = App::db()->prepare(
            'INSERT INTO admin_sessions (token_hash, meta_user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))'
        );
        $statement->execute([hash('sha256', $token), $metaUserId]);
        setcookie(self::SESSION_COOKIE, $token, self::cookieOptions($expires));
        self::$loaded = true;
        self::$userId = $metaUserId;
    }

    public static function destroy(): void
    {
        $token = $_COOKIE[self::SESSION_COOKIE] ?? '';
        if (is_string($token) && $token !== '') {
            App::db()->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        }
        setcookie(self::SESSION_COOKIE, '', self::cookieOptions(time() - 3600));
        setcookie(self::CSRF_COOKIE, '', self::cookieOptions(time() - 3600));
        self::$loaded = true;
        self::$userId = null;
    }

    public static function csrfToken(): string
    {
        $token = $_COOKIE[self::CSRF_COOKIE] ?? '';
        if (!is_string($token) || strlen($token) < 20) {
            $token = App::randomToken(16);
            $options = self::cookieOptions(time() + 30 * 24 * 60 * 60);
            $options['httponly'] = false;
            setcookie(self::CSRF_COOKIE, $token, $options);
        }
        return $token;
    }

    public static function requireCsrf(): void
    {
        $cookie = $_COOKIE[self::CSRF_COOKIE] ?? '';
        $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($cookie) || !is_string($header) || $cookie === '' || !App::safeEqual($cookie, $header)) {
            throw new AppException('پاراستنی دانیشتن نوێ بووەتەوە؛ پەڕەکە نوێ بکەرەوە.', 403);
        }
    }

    public static function beginOAuthState(): string
    {
        App::db()->exec('DELETE FROM oauth_states WHERE expires_at <= UTC_TIMESTAMP()');
        $activeStates = (int) App::db()->query('SELECT COUNT(*) FROM oauth_states')->fetchColumn();
        if ($activeStates >= 500) {
            throw new AppException('داواکاریی زۆر بۆ پەیوەستبوون هەیە؛ چەند خولەکێک دواتر هەوڵ بدەرەوە.', 429);
        }
        $oldState = $_COOKIE[self::OAUTH_STATE_COOKIE] ?? '';
        if (is_string($oldState) && $oldState !== '') {
            App::db()->prepare('DELETE FROM oauth_states WHERE state_hash = ?')
                ->execute([hash('sha256', $oldState)]);
        }
        $state = App::randomToken(32);
        App::db()->prepare(
            'INSERT INTO oauth_states (state_hash, expires_at) VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))'
        )->execute([hash('sha256', $state)]);
        setcookie(self::OAUTH_STATE_COOKIE, $state, self::cookieOptions(time() + 600));
        return $state;
    }

    public static function consumeOAuthState(string $state): bool
    {
        $cookie = $_COOKIE[self::OAUTH_STATE_COOKIE] ?? '';
        setcookie(self::OAUTH_STATE_COOKIE, '', self::cookieOptions(time() - 3600));
        if (!is_string($cookie) || !App::safeEqual($state, $cookie)) {
            return false;
        }
        $statement = App::db()->prepare(
            'DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > UTC_TIMESTAMP()'
        );
        $statement->execute([hash('sha256', $state)]);
        return $statement->rowCount() === 1;
    }
}