<?php
declare(strict_types=1);

final class Http
{
    public static function dispatch(string $path): never
    {
        try {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            if ($path === '/api/health' && $method === 'GET') {
                App::json(['status' => 'ok']);
            }
            if ($path === '/api/meta/status' && $method === 'GET') {
                App::json(Meta::status());
            }
            if ($path === '/api/meta/permissions' && $method === 'GET') {
                $user = Auth::requireUser();
                App::json(Meta::permissions($user, Giveaway::current($user)));
            }
            if ($path === '/api/meta/reel-diagnostic' && $method === 'GET') {
                $user = Auth::requireUser();
                $url = $_GET['url'] ?? '';
                if (!is_string($url) || strlen($url) > 512) {
                    throw new AppException('لینکی Reel ـی Facebook نادروستە.', 400);
                }
                App::json(Meta::diagnoseReel($user, $url));
            }
            if ($path === '/api/meta/login' && $method === 'GET') {
                Meta::login();
            }
            if ($path === '/api/meta/callback' && $method === 'GET') {
                Meta::callback();
            }
            if ($path === '/api/meta/webhook') {
                self::webhook($method);
            }
            if ($path === '/api/meta/disconnect' && $method === 'POST') {
                $user = Auth::requireUser();
                Auth::requireCsrf();
                Giveaway::disconnect($user);
                App::json(['ok' => true]);
            }
            if ($path === '/api/meta/assets' && $method === 'GET') {
                App::json(Meta::assets(Auth::requireUser()));
            }
            if (preg_match('#^/api/meta/assets/([^/]+)/posts$#', $path, $matches) && $method === 'GET') {
                App::json(Meta::posts(Auth::requireUser(), rawurldecode($matches[1])));
            }
            if ($path === '/api/giveaways/current' && $method === 'GET') {
                App::json(Giveaway::projection(Giveaway::current()));
            }
            if ($path === '/api/giveaways/current/recent-comments' && $method === 'GET') {
                App::json(Giveaway::recentComments(Auth::requireUser()));
            }
            if ($path === '/api/giveaways/current' && $method === 'PUT') {
                $user = Auth::requireUser();
                Auth::requireCsrf();
                App::json(Giveaway::upsert($user, App::requestJson()));
            }
            if ($path === '/api/giveaways/current/status' && $method === 'PATCH') {
                $user = Auth::requireUser();
                Auth::requireCsrf();
                $input = App::requestJson();
                App::json(Giveaway::setStatus($user, (string) ($input['status'] ?? '')));
            }
            if ($path === '/api/giveaways/current/sync' && $method === 'POST') {
                $user = Auth::requireUser();
                Auth::requireCsrf();
                App::json(Giveaway::syncCurrent($user));
            }
            App::json(['error' => 'پەڕەکە نەدۆزرایەوە.'], 404);
        } catch (AppException $error) {
            App::json(['error' => $error->safeMessage], $error->status);
        } catch (Throwable) {
            App::json(['error' => 'هەڵەیەکی ناوخۆیی ڕوویدا.'], 500);
        }
    }

    private static function webhook(string $method): never
    {
        $verify = (string) App::config('meta.webhook_verify_token');
        if ($method === 'GET') {
            $mode = $_GET['hub_mode'] ?? $_GET['hub.mode'] ?? '';
            $token = $_GET['hub_verify_token'] ?? $_GET['hub.verify_token'] ?? '';
            $challenge = $_GET['hub_challenge'] ?? $_GET['hub.challenge'] ?? '';
            if ($verify !== '' && $mode === 'subscribe' && is_string($token) && App::safeEqual($verify, $token) && is_string($challenge)) {
                header('Content-Type: text/plain; charset=utf-8');
                echo $challenge;
                exit;
            }
            App::json(['error' => 'داواکاریی Meta پەسەند نەکرا.'], 403);
        }
        if ($method !== 'POST') {
            App::json(['error' => 'ڕێگەپێنەدراوە.'], 405);
        }
        $raw = file_get_contents('php://input') ?: '';
        $signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
        $expected = 'sha256=' . hash_hmac('sha256', $raw, (string) App::config('meta.app_secret'));
        if (!is_string($signature) || !App::safeEqual($expected, $signature)) {
            App::json(['error' => 'واژۆی Meta نادروستە.'], 401);
        }
        App::db()->exec(
            'UPDATE giveaways SET sync_requested=1 WHERE status="running"'
        );
        // Meta receives a fast acknowledgement. The cPanel cron pulls comments
        // with the same lock-protected code, so no webhook request blocks on paging.
        App::json(['ok' => true]);
    }
}
