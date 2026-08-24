<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . ltrim($path, '/');

if (str_starts_with($path, '/api/')) {
    Http::dispatch($path);
}

switch ($path) {
    case '/':
    case '/index.php':
        View::dashboard();
        break;
    case '/live':
    case '/live/':
        View::live();
        break;
    case '/privacy':
    case '/privacy/':
        View::privacy();
        break;
    case '/terms':
    case '/terms/':
        View::terms();
        break;
    default:
        http_response_code(404);
        View::notFound();
}