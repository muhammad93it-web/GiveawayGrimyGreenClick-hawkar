<?php
declare(strict_types=1);

final class View
{
    private static function header(string $title, string $script = ''): void
    {
        $safe = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="ckb" dir="rtl"><head><meta charset="utf-8">';
        echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
        echo '<meta name="description" content="سیستەمی خەڵاتی کۆمێنتی گیادەرمانی سروشتی ڕانیە">';
        echo '<title>' . $safe . '</title><link rel="stylesheet" href="/assets/app.css"></head><body>';
        echo '<main class="shell">';
        if ($script !== '') {
            echo '<script defer src="/assets/' . $script . '"></script>';
        }
    }

    private static function footer(): void
    {
        echo '</main></body></html>';
    }

    public static function dashboard(): void
    {
        self::header('گیادەرمانی سروشتی ڕانیە — داشبۆرد', 'dashboard.js');
        echo '<header class="topbar"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1>سەنتەری بەڕێوەبردنی خەڵات</h1></div></div><a class="button secondary" href="/live" target="_blank">کردنەوەی شاشەی ڕاستەوخۆ</a></header>';
        echo '<div id="notice" class="notice hidden" role="status"></div>';
        echo '<section id="setup-card" class="card hidden"><h2>بەستنەوەی هەژمار</h2><p>بۆ هەڵبژاردنی پۆست و ژماردنی کۆمێنتەکان، هەژماری Meta ـەکەت ببەستەوە.</p><a class="button" href="/api/meta/login">بەستنەوەی فەیسبووک / ئینستاگرام</a><p id="callback" class="code"></p></section>';
        echo '<section id="app-card" class="hidden grid">';
        echo '<article class="card settings"><h2>ڕێکخستنی خەڵات</h2><p id="admin-name" class="muted"></p>';
        echo '<label>پەیج یان هەژمار<select id="asset"><option value="">-- هەڵبژێرە --</option></select></label>';
        echo '<label>پۆست<select id="post"><option value="">-- سەرەتا پەیج هەڵبژێرە --</option></select></label>';
        echo '<label>ناونیشانی خەڵات<input id="prize-title" maxlength="255" placeholder="نموونە: خەڵاتی پایزە"></label>';
        echo '<label>ژمارەی براوەکان<input id="prize-count" type="number" min="1" max="50" value="3"></label>';
        echo '<button id="save" class="button">پاشەکەوتکردن</button><button id="change" class="button danger hidden">گۆڕینی پۆست و دەستپێکردنەوە</button>';
        echo '<hr><button id="refresh-token" class="button secondary">نوێکردنەوەی مۆڵەتەکانی Meta</button><button id="disconnect" class="link danger-text">پچڕاندنی پەیوەندی Meta</button></article>';
        echo '<article class="card controls"><h2>کۆنتڕۆڵەکانی پەخش</h2><p>دۆخ: <strong id="status">دیارینەکراو</strong></p><div class="actions"><button id="start" class="button">دەستپێکردن</button><button id="pause" class="button secondary">وەستاندن</button><button id="complete" class="button warning">کۆتایی هێنان</button><button id="sync" class="button secondary">نوێکردنەوەی کۆمێنت</button></div><p id="sync-note" class="muted"></p></article>';
        echo '<article class="card results"><div class="result-head"><h2>ڕیزبەندی</h2><span id="totals" class="badge">٠ کۆمێنت</span></div><p id="identity-note" class="identity-note hidden"></p><ol id="participants" class="ranking"></ol></article>';
        echo '</section>';
        self::footer();
    }

    public static function live(): void
    {
        self::header('شاشەی ڕاستەوخۆ — گیادەرمانی سروشتی ڕانیە', 'live.js');
        echo '<section id="live" class="live"><header class="live-head"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1 id="live-prize">خەریکی بارکردن...</h1></div></div><div id="live-status" class="badge">چاوەڕێبە</div></header><div id="live-totals" class="live-total"></div><p id="live-identity-note" class="identity-note hidden"></p><div id="podium" class="podium"></div><section class="live-list"><h2>ڕکابەرەکان</h2><ol id="live-participants" class="ranking"></ol></section></section>';
        self::footer();
    }

    public static function privacy(): void
    {
        self::header('سیاسەتی پاراستنی زانیاری');
        echo '<article class="policy card"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1>سیاسەتی پاراستنی زانیاری</h1></div></div><p>ئەم پەڕەیە ڕوون دەکاتەوە چۆن ئەپی خەڵات زانیارییەکان بەکاردێنێت و چۆن دەتوانیت داوای سڕینەوەی زانیاری بکەیت.</p>';
        echo '<h2>کام زانیارییە بەکاردێت؟</h2><p>ئەپەکە تەنها کۆمێنتەکان، ژمارەی کۆمێنتی هەر بەشداربوو، و ئەگەر Meta خۆی ڕێگە بدات ناو و وێنەی پڕۆفایلی کۆمێنتنووس بەکاردێنێت.</p>';
        echo '<h2>زانیارییەکان بۆ چی بەکاردێن؟</h2><p>تەنها بۆ ژماردنی کۆمێنتەکان، ڕیزبەندیی بەشداربووان و دیاریکردنی براوەکان. زانیاری نافرۆشرێت و بۆ ڕیکلام بەکارناهێنرێت.</p>';
        echo '<h2>پاراستن و سڕینەوە</h2><p>مۆڵەتەکانی Meta لەسەر سێرڤەر بە شێوەی کۆدکراو هەڵدەگیرێن و هیچکات لە براوزەر پیشان نادرێن. بەڕێوەبەر دەتوانێت لە داشبۆرد «پچڕاندنی پەیوەندی Meta» بکات؛ ئەو کارە هەموو زانیاریی پەیوەندی، خەڵات و کۆمێنتە هەڵگیراوەکان دەسڕێتەوە.</p>';
        echo '<p><a class="button secondary" href="/">گەڕانەوە بۆ ئەپەکە</a></p></article>';
        self::footer();
    }

    public static function notFound(): void
    {
        self::header('پەڕەکە نەدۆزرایەوە');
        echo '<section class="card empty"><h1>٤٠٤ — پەڕەکە نەدۆزرایەوە</h1><a class="button" href="/">گەڕانەوە</a></section>';
        self::footer();
    }
}