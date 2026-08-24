<?php
declare(strict_types=1);

$index = file_get_contents(__DIR__ . '/../public/index.php');
$view = file_get_contents(__DIR__ . '/../app/View.php');

if (!str_contains($index, "case '/terms':") || !str_contains($index, "View::terms();")) {
    throw new RuntimeException('The /terms route is missing.');
}

foreach ([
    'مەرجەکانی بەکارهێنان',
    'پەیوەندی بە Meta',
    'خەڵات و ڕیزبەندی',
    'بەکارهێنانی نادروست',
    'داتا و پاراستنی زانیاری',
    'سنووری بەرپرسیاری',
    'گۆڕینی مەرجەکان',
    'href="/privacy"',
] as $requiredText) {
    if (!str_contains($view, $requiredText)) {
        throw new RuntimeException("Terms page is missing: {$requiredText}");
    }
}

echo "terms UI contract tests passed\n";