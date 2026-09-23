<?php
declare(strict_types=1);

final class View
{
    private static bool $english = false;

    private static function header(string $title, string $script = ''): void
    {
        $requestedLanguage = $_GET['lang'] ?? null;
        if ($requestedLanguage === 'en' || $requestedLanguage === 'ckb') {
            setcookie('ui_lang', $requestedLanguage, [
                'expires' => time() + 365 * 86400,
                'path' => '/',
                'secure' => App::secureCookies(),
                'samesite' => 'Lax',
            ]);
        }
        self::$english = ($requestedLanguage === 'en')
            || ($requestedLanguage !== 'ckb' && ($_COOKIE['ui_lang'] ?? '') === 'en');
        $language = self::$english ? 'en' : 'ckb';
        $direction = self::$english ? 'ltr' : 'rtl';
        if (self::$english) {
            $title = match ($script) {
                'dashboard.js' => 'Giveaway dashboard — Ranya Natural Herbs',
                'live.js' => 'Live giveaway results — Ranya Natural Herbs',
                default => $title,
            };
        }
        $safe = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="' . $language . '" dir="' . $direction . '"><head><meta charset="utf-8">';
        echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
        echo self::$english
            ? '<meta name="description" content="Ranya Natural Herbs giveaway comment ranking">'
            : '<meta name="description" content="سیستەمی خەڵاتی کۆمێنتی گیادەرمانی سروشتی ڕانیە">';
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
        if (self::$english) {
            echo '<header class="topbar"><div class="brand"><img src="/assets/logo.png" alt="Ranya Natural Herbs logo"><div><p class="eyebrow">Ranya Natural Herbs</p><h1>Giveaway dashboard</h1></div></div><div class="actions"><a class="button secondary" href="/?lang=ckb">کوردی</a><a class="button secondary" href="/live" target="_blank">Open live results</a></div></header>';
            echo '<div id="notice" class="notice hidden" role="status"></div>';
            echo '<section id="setup-card" class="card hidden"><h2>Connect your Facebook Page</h2><p>Connect the Page you manage to select a post and count its comments.</p><a class="button" href="/api/meta/login">Connect Facebook</a><p id="callback" class="code"></p></section>';
            echo '<section id="app-card" class="hidden grid">';
            echo '<article class="card settings"><h2>Giveaway setup</h2><p id="admin-name" class="muted"></p>';
            echo '<label>Facebook Page<select id="asset"><option value="">-- Select a Page --</option></select></label>';
            echo '<label>Post<select id="post"><option value="">-- Select a Page first --</option></select></label>';
            echo '<label>Giveaway title<input id="prize-title" maxlength="255" placeholder="Example: Autumn giveaway"></label>';
            echo '<label>Number of winners<input id="prize-count" type="number" min="1" max="50" value="3"></label><label>Count comments<select id="include-replies"><option value="1">Comments and replies</option><option value="0">Top-level comments only</option></select></label>';
            echo '<button id="save" class="button">Save</button><button id="change" class="button danger hidden">Change post and reset</button>';
            echo '<hr><button id="refresh-token" class="button secondary">Renew Meta permissions</button><button id="check-permissions" class="button secondary">Check Meta permissions</button><button id="disconnect" class="link danger-text">Disconnect Meta</button><pre id="permissions-note" class="muted" style="max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word"></pre></article>';
            echo '<article class="card controls"><h2>Giveaway controls</h2><p>Status: <strong id="status">Not set</strong></p><div class="actions"><button id="start" class="button">Start</button><button id="pause" class="button secondary">Pause</button><button id="complete" class="button warning">Finish</button><button id="sync" class="button secondary">Continue importing comments</button></div><p id="import-note" class="identity-note hidden"></p><p id="sync-note" class="muted"></p></article>';
            echo '<article class="card results"><div class="result-head"><h2>Participant ranking</h2><span id="totals" class="badge">0 comments</span></div><p id="review-context" class="muted"></p><p id="identity-note" class="identity-note hidden"></p><ol id="participants" class="ranking"></ol><h3>Recent Page comments</h3><p class="muted">Author name and photo appear when Meta returns them. This list shows comments with an available author ID.</p><ol id="recent-comments" class="ranking"></ol></article>';
            echo '</section>';
            self::footer();
            return;
        }
        echo '<header class="topbar"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1>سەنتەری بەڕێوەبردنی خەڵات</h1></div></div><div class="actions"><a class="button secondary" href="/?lang=en">English</a><a class="button secondary" href="/live" target="_blank">کردنەوەی شاشەی ڕاستەوخۆ</a></div></header>';
        echo '<div id="notice" class="notice hidden" role="status"></div>';
        echo '<section id="setup-card" class="card hidden"><h2>بەستنەوەی هەژمار</h2><p>بۆ هەڵبژاردنی پۆست و ژماردنی کۆمێنتەکان، هەژماری Meta ـەکەت ببەستەوە.</p><a class="button" href="/api/meta/login">بەستنەوەی فەیسبووک</a><p id="callback" class="code"></p></section>';
        echo '<section id="app-card" class="hidden grid">';
        echo '<article class="card settings"><h2>ڕێکخستنی خەڵات</h2><p id="admin-name" class="muted"></p>';
        echo '<label>پەیج یان هەژمار<select id="asset"><option value="">-- هەڵبژێرە --</option></select></label>';
        echo '<label>پۆست<select id="post"><option value="">-- سەرەتا پەیج هەڵبژێرە --</option></select></label>';
        echo '<label>ناونیشانی خەڵات<input id="prize-title" maxlength="255" placeholder="نموونە: خەڵاتی پایزە"></label>';
        echo '<label>ژمارەی براوەکان<input id="prize-count" type="number" min="1" max="50" value="3"></label><label>شێوازی ژماردن<select id="include-replies"><option value="1">کۆمێنتە سەرەکییەکان و وەڵامەکان</option><option value="0">تەنها کۆمێنتە سەرەکییەکان</option></select></label>';
        echo '<button id="save" class="button">پاشەکەوتکردن</button><button id="change" class="button danger hidden">گۆڕینی پۆست و دەستپێکردنەوە</button>';
        echo '<hr><button id="refresh-token" class="button secondary">نوێکردنەوەی مۆڵەتەکانی Meta</button><button id="check-permissions" class="button secondary">پشکنینی مۆڵەتەکانی Meta</button><button id="disconnect" class="link danger-text">پچڕاندنی پەیوەندی Meta</button><pre id="permissions-note" class="muted" style="max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;direction:rtl;text-align:right"></pre></article>';
        echo '<article class="card controls"><h2>کۆنتڕۆڵەکانی پەخش</h2><p>دۆخ: <strong id="status">دیارینەکراو</strong></p><div class="actions"><button id="start" class="button">دەستپێکردن</button><button id="pause" class="button secondary">وەستاندن</button><button id="complete" class="button warning">کۆتایی هێنان</button><button id="sync" class="button secondary">بەردەوامکردنی هێنانەوە</button></div><p id="import-note" class="identity-note hidden"></p><p id="sync-note" class="muted"></p></article>';
        echo '<article class="card results"><div class="result-head"><h2>ڕیزبەندیی بەشداربووان</h2><span id="totals" class="badge">٠ کۆمێنت</span></div><p id="review-context" class="muted"></p><p id="identity-note" class="identity-note hidden"></p><ol id="participants" class="ranking"></ol><h3>نوێترین کۆمێنتەکانی پەیج</h3><p class="muted">ناو و وێنە کاتێک Meta بیاندات پیشان دەدرێن. تەنها کۆمێنتی خاوەن ناسنامە لەم لیستەدایە.</p><ol id="recent-comments" class="ranking"></ol></article>';
        echo '</section>';
        self::footer();
    }

    public static function live(): void
    {
        self::header('شاشەی ڕاستەوخۆ — گیادەرمانی سروشتی ڕانیە', 'live.js');
        if (self::$english) {
            echo '<section id="live" class="live"><header class="live-head"><div class="brand"><img src="/assets/logo.png" alt="Ranya Natural Herbs logo"><div><p class="eyebrow">Ranya Natural Herbs</p><h1 id="live-prize">Loading...</h1></div></div><div id="live-status" class="badge">Waiting</div></header><div id="live-totals" class="live-total"></div><div id="podium" class="podium"></div><section class="live-list"><h2>Participants</h2><ol id="live-participants" class="ranking"></ol></section></section>';
            self::footer();
            return;
        }
        echo '<section id="live" class="live"><header class="live-head"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1 id="live-prize">خەریکی بارکردن...</h1></div></div><div id="live-status" class="badge">چاوەڕێبە</div></header><div id="live-totals" class="live-total"></div><div id="podium" class="podium"></div><section class="live-list"><h2>ڕکابەرەکان</h2><ol id="live-participants" class="ranking"></ol></section></section>';
        self::footer();
    }

    public static function privacy(): void
    {
        self::header('سیاسەتی پاراستنی زانیاری');
        echo '<article class="policy card"><section lang="ckb" dir="rtl"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1>سیاسەتی پاراستنی زانیاری</h1></div></div>';
        echo '<p><strong>ڕێکەوتی جێبەجێبوون:</strong> ٢٤ی ئابی ٢٠٢٦</p><p>ئەم سیاسەتە ڕوون دەکاتەوە ئەپی خەڵات چ زانیارییەک کۆدەکاتەوە، چۆن بەکاری دەهێنێت و چۆن بەڕێوەبەری پەیج دەتوانێت زانیارییە هەڵگیراوەکان بسڕێتەوە. شێوازی ئێستای ئەپەکە تەنها بۆ Facebook ـە.</p>';
        echo '<h2>١. زانیارییە کۆکراوەکان</h2><p>ئەپەکە ناسنامەی پەیج، ناسنامەی پۆست، ناسنامەی کۆمێنت، دەقی کۆمێنت و کاتی دروستبوونی کۆمێنت کۆدەکاتەوە. کاتێک Meta ئەو خانانە بگەڕێنێتەوە، ناسنامە، ناو و وێنەی پڕۆفایلی نووسەری کۆمێنتیش هەڵدەگیرێن. ئەگەر Meta زانیاریی ناسنامەی نووسەر نەنێرێت، ئەپەکە ناسنامەی ونبوو حدس ناکات و لە هیچ شوێنێک نایپشکنێت یان کۆیناکاتەوە.</p>';
        echo '<h2>٢. مۆڵەت و توکنەکانی Meta</h2><p>توکنەکانی OAuth و دەستگەیشتنی پەیج لەسەر سێرڤەر بە شێوەی کۆدکراو هەڵدەگیرێن و هیچکات بۆ براوزەر پیشان نادرێن.</p>';
        echo '<h2>٣. مەبەستی بەکارهێنانی زانیاری</h2><p>زانیارییەکان تەنها بۆ هێنانی کۆمێنتەکانی پۆستێکی پەیجی Facebook کە بەڕێوەبەر هەڵیدەبژێرێت، ژماردنی کۆمێنتەکانی هەر بەشداربووی ناسنامەدار، پیشاندانی ڕیزبەندی و هەڵبژاردنی براوەکانی خەڵات بەکاردێنرێن.</p>';
        echo '<h2>٤. میوانداری و هاوبەشکردنی زانیاری</h2><p>کۆمپانیای Namecheap, Inc. میوانداری وێب و بنکەی داتای ئەپەکە دابین دەکات. زانیارییەکان نافرۆشرێن، بۆ ڕیکلام بەکارناهێنرێن و بۆ دروستکردنی پڕۆفایلی دەرەکیی بەکارهێنەران هاوبەش ناکرێن.</p>';
        echo '<h2>٥. پچڕاندنی پەیوەندی و سڕینەوە</h2><p>بەڕێوەبەر دەتوانێت بچێتە داشبۆرد و دوگمەی «پچڕاندنی پەیوەندی Meta» دابگرێت. ئەم کارە پەیوەندیی هەڵگیراوی Meta، زانیاریی خەڵات و هەموو کۆمێنتە هێنراوەکان دەسڕێتەوە.</p>';
        echo '<h2>٦. پەیوەندی</h2><p>بۆ پرسیار یان داواکاریی پەیوەست بە پاراستنی زانیاری، ئیمەیڵ بنێرە بۆ <a href="mailto:mangherbal93@gmail.com">mangherbal93@gmail.com</a>.</p>';
        echo '</section><hr><section lang="en" dir="ltr"><h1>Privacy Policy</h1><p><strong>Effective date:</strong> August 24, 2026</p><p>This Privacy Policy explains what data the giveaway application collects, how it uses and protects that data, and how an authorized Facebook Page administrator can delete stored data. The current application is Facebook-only.</p>';
        echo '<h2>1. Data We Collect</h2><p>The application collects the selected Facebook Page ID, post ID, comment ID, comment text, and comment creation time. When Meta provides the fields, the application also stores the comment author ID, name, and profile picture. Meta may omit author identity fields; when it does, the application does not guess, scrape, or otherwise attempt to recover missing identities.</p>';
        echo '<h2>2. Meta Tokens</h2><p>Meta OAuth tokens and Page access tokens are stored encrypted on the server. They are not displayed in or sent back to the browser.</p>';
        echo '<h2>3. How We Use Data</h2><p>The data is used only to import comments from the Facebook Page post selected by an authorized Page administrator, count comments for each identified participant, display giveaway rankings, and select giveaway winners.</p>';
        echo '<h2>4. Hosting and Disclosure</h2><p>Namecheap, Inc. provides web and database hosting for the application. Data is not sold, used for advertising, or used for external profiling.</p>';
        echo '<h2>5. Disconnecting and Deleting Data</h2><p>The Page administrator can open the dashboard and select “Disconnect Meta.” Disconnecting deletes the stored Meta connection, giveaway data, and imported comments.</p>';
        echo '<h2>6. Contact</h2><p>For privacy questions or deletion requests, email <a href="mailto:mangherbal93@gmail.com">mangherbal93@gmail.com</a>.</p></section>';
        echo '<p><a class="button secondary" href="/">گەڕانەوە بۆ ئەپەکە / Back to application</a> <a class="button secondary" href="/terms">مەرجەکانی بەکارهێنان / Terms of Use</a></p></article>';
        self::footer();
    }

    public static function terms(): void
    {
        self::header('مەرجەکانی بەکارهێنان');
        echo '<article class="policy card"><section lang="ckb" dir="rtl"><div class="brand"><img src="/assets/logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"><div><p class="eyebrow">گیادەرمانی سروشتی ڕانیە</p><h1>مەرجەکانی بەکارهێنان</h1></div></div>';
        echo '<p><strong>ڕێکەوتی جێبەجێبوون:</strong> ٢٤ی ئابی ٢٠٢٦</p><p>ئەم مەرجانە ڕوونی دەکەنەوە چۆن دەتوانیت سیستەمی ژماردنی کۆمێنت و ڕیزبەندیی بەشداربووانی «گیادەرمانی سروشتی ڕانیە» بەکاربهێنیت. بە بەکارهێنانی ئەپەکە، ڕازیت بە پابەندبوون بەو مەرجانە. شێوازی ئێستای ئەپەکە تەنها بۆ Facebook ـە.</p>';
        echo '<h2>١. بەکارهێنانی ئەپەکە و مۆڵەتی پەیج</h2><p>ئەپەکە تەنها کۆمێنتەکانی ئەو پۆستەی پەیجی Facebook دەهێنێت کە بەڕێوەبەرێکی مۆڵەت‌پێدراوی پەیج هەڵیدەبژێرێت. بەکارهێنەر بەرپرسیارە لە دروستی زانیارییەکان و لەوەی مۆڵەتی بەڕێوەبردنی پەیج و بەکارهێنانی داتاکانی هەبێت.</p>';
        echo '<h2>٢. پەیوەندی بە Meta و ناسنامەی کۆمێنتنووس</h2><p>ئەپەکە تەنها ئەو زانیارییە بەکاردێنێت کە Meta بە شێوەی ڕێگەپێدراو دەیگەڕێنێتەوە. Meta لەوانەیە خانەکانی ناسنامەی کۆمێنتنووس نەنێرێت؛ لەو حاڵەتەدا ئەپەکە ناو، ناسنامە یان وێنەی ونبوو حدس ناکات، نایپشکنێت و لە هیچ شوێنێکی دیکە کۆیناکاتەوە.</p>';
        echo '<h2>٣. یاسا و بەرپرسیاریی خەڵات</h2><p>بەڕێوەبەری پەیج بەرپرسیارە لە دانانی یاساکانی خەڵات، مەرجەکانی شایستەبوون و بەشداری، جۆر و بەهای خەڵاتەکان، شێوازی هەڵبژاردنی براوەکان و گەیاندنی خەڵات بە براوەکان. ئەپەکە تەنها کۆمێنتەکان دەژمێرێت، ڕیزبەندی پیشان دەدات و بە پێی ڕێکخستنی بەڕێوەبەر براوە هەڵدەبژێرێت.</p>';
        echo '<h2>٤. نەبوونی پەیوەندی بە Facebook یان Meta</h2><p><strong>ئەم ئەپی خەڵاتە و خەڵاتەکانی نە لەلایەن Facebook یان Meta پشتگیری، پەسەند یان بەڕێوەبردن دەکرێن و نە پەیوەندییان بە Facebook یان Meta ـەوە هەیە.</strong></p>';
        echo '<h2>٥. بەکارهێنانی نادروست</h2><p>نابێت ئەپەکە بۆ تێکدانی سیستەم، داواکاریی زۆر و زیانبەخش، تێپەڕاندنی مۆڵەتەکان، یان دەستکاریی داتا بەکاربهێنرێت. بەکارهێنانی ئەپەکە بە شێوەی یاسایی و بە ڕێزەوە بۆ هەموو بەشداربووان بێت.</p>';
        echo '<h2>٦. داتا، پاراستنی زانیاری و سڕینەوە</h2><p>شێوازی کۆکردنەوە و بەکارهێنانی زانیاری لە <a href="https://giveaway.mang-herbal.com/privacy">سیاسەتی پاراستنی زانیاری</a> ڕوون کراوەتەوە. بەڕێوەبەر دەتوانێت لە داشبۆرد دوگمەی «پچڕاندنی پەیوەندی Meta» دابگرێت؛ ئەو کارە پەیوەندیی هەڵگیراوی Meta، زانیاریی خەڵات و هەموو کۆمێنتە هێنراوەکان دەسڕێتەوە.</p>';
        echo '<h2>٧. سنووری بەرپرسیاری و گۆڕینی مەرجەکان</h2><p>ئەپەکە بە پێی توانای بەردەست پێشکەش دەکرێت. گۆڕانکاری، سنوورداری یان پچڕانی خزمەتگوزاریی Meta دەتوانێت کاریگەری لەسەر هێنانی کۆمێنت یان ناسنامەی بەشداربووان هەبێت. دەتوانرێت ئەم مەرجانە نوێ بکرێنەوە و وەشانی نوێ لەم پەڕەیەدا بڵاو دەکرێتەوە.</p>';
        echo '<h2>٨. پەیوەندی</h2><p>بۆ پرسیارێک دەربارەی ئەم مەرجانە، ئیمەیڵ بنێرە بۆ <a href="mailto:mangherbal93@gmail.com">mangherbal93@gmail.com</a>.</p>';
        echo '</section><hr><section lang="en" dir="ltr"><h1>Terms of Use</h1><p><strong>Effective date:</strong> August 24, 2026</p><p>These Terms of Use govern access to and use of the Mang Herbal giveaway application. By using the application, you agree to these terms. The current application is Facebook-only.</p>';
        echo '<h2>1. Application Scope and Authorized Access</h2><p>The application imports comments only from a Facebook Page post selected by an authorized Page administrator. The administrator is responsible for providing accurate information and for having permission to administer the Page and use its data for the giveaway.</p>';
        echo '<h2>2. Comment Data and Missing Identities</h2><p>The application uses only data returned through authorized Meta services. Meta may omit commenter identity fields. The application does not guess, scrape, or otherwise attempt to recover a missing author ID, name, or profile picture.</p>';
        echo '<h2>3. Giveaway Responsibilities</h2><p>The Page administrator is responsible for giveaway rules, eligibility, prizes, winner selection, and prize delivery. The application only imports and counts comments, displays rankings, and selects winners according to the settings chosen by the administrator.</p>';
        echo '<h2>4. No Sponsorship or Endorsement</h2><p><strong>This giveaway application and its giveaways are not sponsored, endorsed, administered by, or associated with Facebook or Meta.</strong></p>';
        echo '<h2>5. Acceptable Use</h2><p>You must not use the application to disrupt services, send harmful or excessive requests, bypass permissions, manipulate data, or violate applicable law. The application must be used fairly and respectfully toward giveaway participants.</p>';
        echo '<h2>6. Data, Privacy, and Deletion</h2><p>Data collection and use are explained in the <a href="https://giveaway.mang-herbal.com/privacy">Privacy Policy</a>. The administrator can disconnect Meta from the dashboard and delete the stored Meta connection, giveaway data, and imported comments.</p>';
        echo '<h2>7. Availability and Changes</h2><p>The application is provided as available. Changes, limits, or interruptions in Meta services may affect comment imports or participant identity fields. These terms may be updated when needed, and the current version will be published on this page.</p>';
        echo '<h2>8. Contact</h2><p>For questions about these terms, email <a href="mailto:mangherbal93@gmail.com">mangherbal93@gmail.com</a>.</p></section>';
        echo '<p><a class="button secondary" href="/">گەڕانەوە بۆ ئەپەکە / Back to application</a> <a class="button secondary" href="/privacy">سیاسەتی پاراستنی زانیاری / Privacy Policy</a></p></article>';
        self::footer();
    }

    public static function notFound(): void
    {
        self::header('پەڕەکە نەدۆزرایەوە');
        echo '<section class="card empty"><h1>٤٠٤ — پەڕەکە نەدۆزرایەوە</h1><a class="button" href="/">گەڕانەوە</a></section>';
        self::footer();
    }
}
