<?php
declare(strict_types=1);

const APP_ROOT = __DIR__ . '/..';

$configFile = getenv('APP_CONFIG_FILE') ?: APP_ROOT . '/config/config.php';
if (!is_file($configFile)) {
    http_response_code(503);
    exit('ڕێکخستنی ئەپ تەواو نەکراوە. تکایە config/config.php دروست بکە.');
}

$config = require $configFile;
$appKey = is_array($config) ? (string) ($config['app_key'] ?? '') : '';
$appUrl = is_array($config) ? (string) ($config['app_url'] ?? '') : '';
$database = is_array($config) ? ($config['db'] ?? null) : null;
$databaseValid = is_array($database)
    && !empty($database['host'])
    && !empty($database['name'])
    && !empty($database['user'])
    && array_key_exists('password', $database);
if (
    !is_array($config)
    || strlen($appKey) < 32
    || str_contains($appKey, 'GENERATE_A_LONG_RANDOM_SECRET')
    || !str_starts_with($appUrl, 'https://')
    || !$databaseValid
    || !isset($config['meta'])
) {
    http_response_code(503);
    exit('فایلی ڕێکخستن نادروستە؛ HTTPS، app_key ـی درێژ و زانیاریی بنکەی داتا پێویستن.');
}

date_default_timezone_set('UTC');

class AppException extends RuntimeException
{
    public int $status;
    public string $safeMessage;

    public function __construct(string $safeMessage, int $status = 400)
    {
        parent::__construct($safeMessage);
        $this->status = $status;
        $this->safeMessage = $safeMessage;
    }
}

final class App
{
    private static array $config;
    private static ?PDO $pdo = null;

    public static function boot(array $config): void
    {
        self::$config = $config;
    }

    public static function config(string $key = null): mixed
    {
        if ($key === null) {
            return self::$config;
        }
        $value = self::$config;
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return null;
            }
            $value = $value[$part];
        }
        return $value;
    }

    public static function db(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $db = self::config('db');
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']);
        self::$pdo = new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        self::$pdo->exec("SET time_zone = '+00:00'");
        return self::$pdo;
    }

    public static function url(string $path = ''): string
    {
        return rtrim((string) self::config('app_url'), '/') . $path;
    }

    public static function secureCookies(): bool
    {
        return str_starts_with(self::url(), 'https://');
    }

    public static function randomToken(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    public static function key(): string
    {
        return hash('sha256', (string) self::config('app_key'), true);
    }

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Token encryption failed');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $encrypted): string
    {
        $raw = base64_decode($encrypted, true);
        if ($raw === false || strlen($raw) < 29) {
            throw new RuntimeException('Invalid encrypted value');
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($plain === false) {
            throw new RuntimeException('Unable to decrypt stored value');
        }
        return $plain;
    }

    public static function json(array $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function redirect(string $path): never
    {
        header('Location: ' . self::url($path), true, 302);
        exit;
    }

    public static function requestJson(): array
    {
        $body = file_get_contents('php://input');
        $parsed = json_decode($body ?: '{}', true);
        if (!is_array($parsed)) {
            throw new AppException('زانیاریی ناردراو نادروستە.', 400);
        }
        return $parsed;
    }

    public static function iso(?string $value): ?string
    {
        if (!$value) {
            return null;
        }
        $time = strtotime($value . ' UTC');
        return $time === false ? null : gmdate('c', $time);
    }

    public static function safeEqual(string $a, string $b): bool
    {
        return hash_equals($a, $b);
    }
}

App::boot($config);

require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Meta.php';
require_once __DIR__ . '/Giveaway.php';
require_once __DIR__ . '/CommentImport.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/View.php';