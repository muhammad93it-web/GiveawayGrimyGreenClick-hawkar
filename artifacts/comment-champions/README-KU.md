# گیادەرمانی سروشتی ڕانیە — ڕێبەری دەستی پێکردن

ئەم پڕۆژەیە وێب ئەپێکی کوردیی RTL ـە بۆ ڕیزبەندی کۆمێنتەکانی پۆستەکانی فەیسبووک و ئینستاگرام و پیشاندانی ئەنجامەکان بە شێوەی لایڤ.

## ئەوەی ئامادەیە

- داشبۆردی بەڕێوەبردن بە کوردیی سۆرانی
- شاشەی `/live` بۆ پیشاندانی ڕیزبەندی لە مۆبایل، TV یان لایڤ
- ڕووکارێکی تەواو ڕیسپۆنسیڤ بۆ مۆبایل
- لۆگۆی گیادەرمانی سروشتی ڕانیە
- پەیوەستکردنی ڕاستەقینەی Facebook Page و Instagram Business
- هەڵبژاردنی پەیج/هەژمار و پۆستی خەڵات
- وەرگرتنی کۆمێنتەکان، لابردنی دووبارەکان و ژماردنی هەر بەشداربوو
- هەڵگرتنی داتا لە PostgreSQL و پاراستنی کۆدکراوی Meta token
- نوێکردنەوەی خۆکار لە کاتی چاودێریکردن و polling ـی شاشەی `/live`

> **تێبینی:** هیچ داتای نموونە یان access token ـێک لە frontend هەڵناگیرێت. تا `META_APP_ID` و `META_APP_SECRET` دانەنرێن، ئەپەکە بە ڕوونی دۆخی «ڕێکنەخراوە» پیشان دەدات.

## لە کوێ پڕۆژەکە کار بکەیت؟

باشترین هەڵبژاردە لەسەر کۆمپیوتەر:

1. [VS Code](https://code.visualstudio.com/) دابەزێنە.
2. [Node.js LTS](https://nodejs.org/) و `pnpm` دابەزێنە.
3. فایلە ZIP ـەکە بکەرەوە.
4. لە VS Code، فۆڵدەری سەرەکی پڕۆژەکە بکەرەوە.
5. PostgreSQL ـێک ئامادە بکە.
6. Terminal بکەرەوە و ئەم فرمانانە بنووسە:

```bash
corepack enable
pnpm install
```

## environment variables ـی پێویست

ئەم نرخانە هەرگیز لە کۆد، GitHub یان چاتدا مەخە. لە Replit Secrets یان secret manager ـی هۆستەکەت دایانبنێ:

```text
DATABASE_URL=postgresql://...
SESSION_SECRET=ڕستەیەکی-درێژ-و-هەڕەمەکی
META_APP_ID=App-ID-ی-Meta
META_APP_SECRET=App-Secret-ی-Meta
META_ALLOWED_PAGE_ID=Facebook-Page-ID-ی-ڕێگەپێدراو
```

ئەم نرخانە ئارەزوومەندانەن:

```text
META_REDIRECT_URI=https://your-domain.com/api/meta/callback
APP_ORIGIN=https://your-domain.com
META_GRAPH_VERSION=v26.0
META_WEBHOOK_VERIFY_TOKEN=ڕستەیەکی-درێژ-و-هەڕەمەکی
```

- ئەگەر `META_REDIRECT_URI` دانەنرێت، backend callback URL ـەکە لە دۆمەینی داواکارییەکە دروست دەکات.
- بۆ بڵاوکردنەوەی ڕاستەقینە، `META_REDIRECT_URI` و `APP_ORIGIN` بە دۆمەینی HTTPS ـی بڵاوکراوە دیاری بکە. ئەو callback URL ـەی لە Meta App دادەنرێت دەبێت بە تەواوی یەکسان بێت.
- `META_ALLOWED_PAGE_ID` تەنها ئەو پەیجە و Instagram Business ـە بەستراوەکەی ڕێگەپێدەدات؛ هەژمارێکی دیکە ناتوانێت شاشەی لایڤ بگۆڕێت.
- dashboard هەمیشە callback URL ـی ڕاست پیشان دەدات تا کۆپی بکەیت بۆ **Valid OAuth Redirect URIs**.
- `SESSION_SECRET` کلیلی کۆدکردنی token ـەکانیشە؛ دوای هەڵگرتنی token نابێت بگۆڕدرێت، مەگەر پەیوەندی Meta دووبارە دروست بکەیتەوە.
- `META_WEBHOOK_VERIFY_TOKEN` بۆ پشتڕاستکردنەوەی callback ـی ئاگادارییەکانی Meta ـیە و دەبێت جیاواز بێت لە App Secret.

### نرخەکانی وەشانی بڵاوکراو بۆ ئەم پڕۆژەیە

کاتێک لە Replit وەشانی گشتی بڵاو دەکەیتەوە و دۆمەینی `giveaway.mang-herbal.com` پەیوەست دەکەیت، ئەم دوو نرخە لە ژینگەی production دابنێ:

```text
APP_ORIGIN=https://giveaway.mang-herbal.com
META_REDIRECT_URI=https://giveaway.mang-herbal.com/api/meta/callback
```

پاش بڵاوکردنەوە، ئەم دوو بەستەرە بە براوزەر تاقی بکەوە:

```text
https://giveaway.mang-herbal.com/privacy
https://giveaway.mang-herbal.com/api/meta/status
```

یەکەم دەبێت سیاسەتی پاراستنی زانیاری پیشان بدات و دووەم دەبێت وەڵامی `configured` و `callbackUrl` بداتەوە؛ ئەگەر `configured` ـەکە `false` بوو، نهێنییەکانی production پڕ نەکراونەتەوە.

## ڕاکردنی پڕۆژە لەسەر کۆمپیوتەر

یەکەم schema ـی database بنێرە:

```bash
pnpm --filter @workspace/db run push
```

لە Terminal ـی یەکەم API server ڕابکە:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

لە Terminal ـی دووەم frontend ڕابکە:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/comment-champions run dev
```

Vite بە شێوەی بنەڕەتی `/api` بۆ `http://localhost:8080` دەگوازێتەوە. ئەگەر backend ـەکەت لە شوێنێکی دیکەیە:

```bash
PORT=5173 BASE_PATH=/ API_PROXY_TARGET=http://localhost:9000 pnpm --filter @workspace/comment-champions run dev
```

لە Windows PowerShell بۆ frontend:

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; pnpm --filter @workspace/comment-champions run dev
```

پاشان لە براوزەر بکەرەوە:

```text
http://localhost:5173
```

## بڵاوکردنەوە

ئەمە ئێستا full-stack ـە؛ frontend ـی static بە تەنها کۆمێنتی Meta وەرناگرێت. پێویستە:

- PostgreSQL بەردەست بێت.
- API server ـی Node.js بەردەوام کار بکات.
- `/api` و frontend لە هەمان دۆمەین بن، یان reverse proxy ـێک `/api` بۆ backend بگوازێتەوە.
- هەموو environment variables ـەکان لە secret manager دابنرێن.
- callback URL ـی HTTPS لە Meta App زیاد بکرێت.

لە Replit، artifact routing پێشتر frontend و `/api` لە هەمان دۆمەین پێکەوە دەبەستێتەوە و Publish schema ـی database بۆ production هاوکات دەکات.

بۆ دروستکردنی فایلەکانی بڵاوکردنەوە:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/comment-champions run build
```

فۆڵدەری دەرئەنجام:

```text
artifacts/comment-champions/dist/public
```

## چۆن Meta App دروست بکەیت؟

1. بە هەژماری فەیسبووکەکەت بچۆ بۆ [Meta for Developers](https://developers.facebook.com/) و وەک developer تۆماربە.
2. بچۆ بۆ **My Apps** → **Create App**.
3. لە use case ـەکان، **Manage everything on your Page** هەڵبژێرە؛ ئەمە بۆ بەڕێوەبردنی پەیج و کۆمێنتەکان گونجاوە.
4. ناوی ئەپەکە دابنێ، ئیمەیڵی پەیوەندی بنووسە و business account ـەکەت هەڵبژێرە ئەگەر هەیە.
5. لە **App settings → Basic**، دۆمەینی وێب‌سایتە بڵاوکراوەکەت، Privacy Policy URL و Data Deletion URL دابنێ. بۆ تاقیکردنەوە لەسەر کۆمپیوتەر دەتوانیت `localhost` بەکاربهێنیت؛ بۆ بەکارهێنانی ڕاستەقینە پێویستە دۆمەینێکی HTTPS هەبێت.
6. دڵنیابە کە Instagram Business/Creator ـەکەت بە Facebook Page ـەکەتەوە بەستراوە.
7. لە App Dashboard، **Facebook Login for Business** زیاد بکە. کاتێک backend ـەکەت ئامادە بوو، callback URL ـی خۆت لە **Valid OAuth Redirect URIs** دابنێ، بۆ نموونە:

```text
https://your-domain.com/api/meta/callback
```

8. بۆ دەستگەیشتن بە پەیج و کۆمێنتەکان، تەنها مۆڵەتە پێویستەکان داوا بکە:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_read_user_content`
   - `pages_manage_engagement` تەنها ئەگەر دەتەوێت کۆمێنت وەڵام بدەیت، بشاریتەوە یان بەڕێوەی ببەیت
   - `instagram_basic`
   - `instagram_manage_comments` تەنها ئەگەر کارکردن لەگەڵ کۆمێنتی ئینستاگرام پێویست بێت
   - `pages_read_user_content` بۆ خوێندنەوەی ناوەڕۆکی بەکارهێنەران، وەک کۆمێنتەکانی پەیج. Meta تەنها کاتێک زانیارییەکانی نووسەر بگەڕێنێتەوە ناو و وێنە دەردەکەون؛ ئەگەر نەیگەڕێنێتەوە، ژماردن کار دەکات بەڵام ناوەکان وەک «بێ ناو» دەردەکەون.
9. لە کاتی development، تەنها تۆ و ئەو test user ـانەی لە Roles زیادکراون دەستگەیشتن دەبینن. بۆ بەکارهێنەرانی دیکە، پێویستە Meta App Review داواکاری بکەیت و بەکارهێنانی هەر مۆڵەتێک ڕوون بکەیتەوە.
10. **App Secret** و access token ـەکانت هەرگیز لە frontend، GitHub، یان چاتدا مەخە. تەنها لە environment variables ـی سێرڤەر هەڵیانبگرە.

## ئامادەکردن بۆ بەکارهێنەرانی گشتی

> **گرنگ:** App Review، پشتڕاستکردنەوەی کاروبار و چالاککردنی دۆخی گشتی لە داشبۆردی Meta ئەنجام دەدرێن؛ بە کۆدی ئەم پڕۆژەیە ناکرێن. ئەم چێکلیستە پێویستە پێش بڵاوکردنەوە تەواو بکرێت.

### ١. پێش ناردنی داواکاری

1. وەشانی بڵاوکراو لەسەر دۆمەینێکی HTTPS ڕابکە و دڵنیابە `/api/meta/callback` بەردەستە.
2. لە **App settings → Basic** ناوی ئەپ، ئیمەیڵی پەیوەندی، ئایکۆنی ١٠٢٤×١٠٢٤، دۆمەینی وێب‌سایت و URL ـی سیاسەتی پاراستنی زانیاری دابنێ. بۆ ئەم پڕۆژەیە:

   ```text
   https://giveaway.mang-herbal.com/privacy
   ```

   هەمان بەستەر دەتوانێت وەک URL ـی ڕێنمایی سڕینەوەی زانیاری بەکاربهێنرێت، چونکە ڕێگای داواکردنی سڕینەوە و کاری پچڕاندنی پەیوەندی ڕوون دەکاتەوە.
3. لە **Facebook Login for Business**، تەنها ئەم callback URL ـەی یەکسان بە `META_REDIRECT_URI` لە **Valid OAuth Redirect URIs** دابنێ:

   ```text
   https://giveaway.mang-herbal.com/api/meta/callback
   ```

4. هەژماری Instagram دەبێت Business یان Creator بێت و بە Facebook Page ـی `META_ALLOWED_PAGE_ID` بەستراو بێت.
5. بە هەژماری بەڕێوەبەری پەیج، یەک جار هەموو کارە سەرەکییەکان تاقی بکەرەوە: بەستنەوە، هەڵبژاردنی پۆست، نوێکردنەوەی کۆمێنت و پیشاندانی ڕیزبەندی.

### ٢. مۆڵەتەکان و هۆکاری داواکردنیان

تەنها ئەم مۆڵەتانەی کۆدی ئەپ داوایان دەکات بۆ پێداچوونەوە بنێرە؛ مۆڵەتی زیادە مەخوازە:

| مۆڵەت | بۆچی پێویستە |
| --- | --- |
| `pages_show_list` | دۆزینەوەی Facebook Page ـی بەڕێوەبەر و دڵنیابوون لەوەی تەنها پەیجی ڕێگەپێدراو هەڵبژێردراوە. |
| `pages_read_engagement` | خوێندنەوەی پۆستەکان و چاودێریکردنی بەشداریی پەیج بۆ دیاریکردنی پۆستی خەڵات. |
| `pages_read_user_content` | خوێندنەوەی کۆمێنتەکانی خەڵک لە پۆستی هەڵبژێردراو، تەنها بۆ ژماردن و ڕیزبەندی. |
| `instagram_basic` | دۆزینەوەی هەژماری Instagram Business/Creator ـی بەستراو بە پەیج. |
| `instagram_manage_comments` | خوێندنەوەی کۆمێنتەکانی پۆستی Instagram بۆ هەمان خەڵات. |

- ئەگەر Instagram بەکارت نایەت، دوو مۆڵەتی Instagram لە داواکاری پێداچوونەوەدا مەخوازە و لە کۆدیش لایببە.
- `pages_manage_engagement` لە ئەم ئەپەدا پێویست نییە، چونکە ئەپەکە وەڵام ناداتەوە، ناشارێتەوە و نایسڕێتەوە.
- لە کاتی چوونەژوورەوە، ئەپەکە دووبارە داواکردنی مۆڵەتی ڕەتکراوەوە دەکات. بەکارهێنەر دەبێت هەموو مۆڵەتە پێویستەکان پەسەند بکات.

### ٣. پێداچوونەوەی ئەپ و پشتڕاستکردنەوەی کاروبار

1. پێش ناردنی داواکاری، بۆ هەر مۆڵەتێک لە ٣٠ ڕۆژی ڕابردوودا یەک بانگکردنەوەی سەرکەوتوو بۆ API ئەنجام بدە.
2. لە **App Review → Permissions and features** بۆ هەر مۆڵەتی سەرەوە دەستیگەیشتنی فراوان داوا بکە و بە کورتی بنووسە کە داتا تەنها بۆ خەڵات، ژماردن و ڕیزبەندی بەکاردێت.
3. ڤیدیۆیەکی ڕوون و بەرزکوالێتی بنێرە کە پیشان بدات: بەکارهێنەر مۆڵەت دەدات، پەیجی ڕێگەپێدراو هەڵدەبژێرێت، پۆستی خەڵات دیاری دەکات، کۆمێنتەکان نوێ دەکرێنەوە و لە داشبۆرد/شاشەی ڕاستەوخۆ دەردەکەون. لەبەر ئەوەی ڕووکارەکە کوردییە، نووسینی ڕوونکردنەوەی ئینگلیزی لەسەر ڤیدیۆکە زیاد بکە.
4. بەستەر و ڕێنماییەکی ڕوون بۆ تاقیکردنەوەی پشکنەر دابین بکە. ئەگەر چوونەژوورەوەی تایبەت پێویست بێت، هەژماری تاقیکردنەوە دابین بکە و دوای پێداچوونەوە بیسڕەوە.
5. کاروبارەکە لە Meta Business Manager پەیوەست بکە و پڕۆسەی **Business Verification** تەواو بکە. دەستیگەیشتنی فراوان بۆ مۆڵەتەکان پێویستی بەو پشتڕاستکردنەوەیە هەیە.
6. تەنها کاتێک مۆڵەتە داواکراوەکان پەسەندکران، لە **Publish → Go live** دۆخی ئەپەکە بگۆڕە بۆ گشتی.

### ٤. تاقیکردنەوەی کۆتایی بە هەژماری دەرەوەی ڕۆڵەکانی ئەپ

ئەم هەنگاوە دوای پەسەندکرانی پێداچوونەوە، پشتڕاستکردنەوەی کاروبار و چالاککردنی دۆخی گشتی ئەنجام بدە:

1. یەک پەیوەندیی Meta لە داشبۆرد پچڕێنەوە. ئەمە زانیاریی خەڵات و کۆمێنتە هەڵگیراوەکان دەسڕێتەوە؛ ئەنجامی پێویست پێشتر هەڵبگرە.
2. لە براوزەرێکی تایبەت، بە هەژمارێکی فەیسبووک بچۆ ژوورەوە کە لە ڕۆڵەکانی ئەپ نییە، بەڵام دەسەڵاتی بەڕێوەبردنی هەمان Facebook Page ـی ڕێگەپێدراوی هەیە.
3. **بەستنەوەی فەیسبووک / ئینستاگرام** بکە، هەموو مۆڵەتەکان پەسەند بکە، پەیج و پۆست هەڵبژێرە و نوێکردنەوە بکە.
4. دڵنیابە ژمارەی کۆمێنت و بەشداربووان دەردەکەوێت و هەڵەی مۆڵەت نییە. پاشان، ئەگەر پێویست بوو، پەیوەندیی بەڕێوەبەری سەرەکی دووبارە دروست بکەوە.

### سنووری گرنگی داتای کۆمێنتنووس

پەسەندکرانی پێداچوونەوە و دۆخی گشتی، تەنها ڕێگە دەدات بەکارهێنەرانی دەرەوەی ڕۆڵەکانی ئەپ چوونەژوورەوە بکەن؛ بەڵێنی گەڕاندنەوەی ناو یان وێنەی هەموو کۆمێنتنووسێک نادات. ئەگەر Meta خانەی `from` بۆ کۆمێنت نەنێرێت، ئەپەکە بە شێوەی پارێزراو بە «بێ ناو» ژماردن و ڕیزبەندی بەردەوام دەکات و هەوڵ نادات ناسنامەی کەسەکە بدۆزێتەوە.

### دەقی ئامادە بۆ App Review

ئەم دەقانە دەتوانیت لە خانەکانی **App Review** دابنێیت. تەنها ئەو مۆڵەتانە بنووسە کە بەڕاستی لە کۆدی ئەپەکەدا چالاکن.

**App description (English):**

```text
Gyadarmany Ranya is a Sorani Kurdish web app for running transparent
comment-based giveaways on one authorized Facebook Page and its connected
Instagram Business account. A Page administrator connects the account, selects
one post, and the app reads comments only to count participation and display a
giveaway ranking. The app does not publish, reply to, hide, delete, sell, or
advertise with commenter data.
```

**Permission explanations (English):**

```text
pages_show_list:
The Page administrator uses this permission to select and verify the one
authorized Facebook Page used by the giveaway. The app stores and exposes only
the configured Page; it does not let the user select unrelated Pages.

pages_read_engagement:
The app uses this permission to list the authorized Page's recent posts so the
administrator can select the giveaway post. It also supports reading the
selected post's engagement needed for the giveaway workflow.

pages_read_user_content:
The app uses this permission to read comments on the administrator's selected
Page post. Comments are used only to count participation, aggregate rankings,
and select giveaway winners. The app does not use the content for advertising
or share it with third parties.

instagram_basic:
The app uses this permission to identify the Instagram Business or Creator
account connected to the authorized Facebook Page and list its media for
giveaway post selection.

instagram_manage_comments:
The app uses this permission to read comments on the selected Instagram media
for the same comment-counting and ranking workflow. The app does not moderate,
reply to, hide, or delete comments.
```

**Reviewer steps (English):**

```text
1. Open https://giveaway.mang-herbal.com/ and click
   "Connect Facebook / Instagram".
2. Sign in with the review account and grant the requested permissions. The
   account must have Page access to the configured Page.
3. Select the authorized Facebook Page (and its connected Instagram account if
   testing Instagram), then select a recent post.
4. Configure a giveaway and start a sync. Verify that comment totals and
   participant rankings are displayed on the dashboard and /live page.
5. Open https://giveaway.mang-herbal.com/privacy to review data use and
   deletion instructions.
```

لە خانەی تاقیکردنەوەی Meta، هەژمارێکی تاقیکردنەوە بە ڕێگای پارێزراوی خۆی Meta زیاد بکە و دەسەڵاتی پەیجە ڕێگەپێدراوەکەی پێبدە؛ هیچ وشەی نهێنی لە README، Git یان چاتدا مەنووسە. ڤیدیۆی پێداچوونەوەش دەبێت هەمان هەنگاوەکان، بە مۆڵەتی خۆبەخش و دەرهێنانی ئەنجامەکان، پیشان بدات.

## پەیوەستکردنی Instagram

ئەگەر Instagram Business/Creator ـەکەت بە Facebook Page بەستراو بێت، دەتوانیت بە Facebook Login for Business توکن و Page ID وەرگریت و پاشان Instagram account ـە پەیوەستکراوەکە بدۆزیتەوە. دۆکیومێنتی فەرمی Meta بۆ ئەم ڕێگایە:

- [Facebook Pages API](https://developers.facebook.com/docs/pages-api/)
- [Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/)
- [Instagram comment moderation](https://developers.facebook.com/docs/instagram-platform/comment-moderation)

## شێوازی کارکردن

1. dashboard بکەرەوە و callback URL ـە پیشاندراوەکە لە Meta App دابنێ.
2. کرتە لە **بەستنەوەی فەیسبووک / ئینستاگرام** بکە.
3. پەیج یان Instagram Business ـی بەستراو و پۆستی خەڵات هەڵبژێرە.
4. ناونیشان و ژمارەی براوەکان دابنێ و پاشەکەوت بکە.
5. نوێکردنەوەی یەکەم خۆکار دەکرێت؛ دەتوانیت بە دەستییش نوێی بکەیتەوە.
6. لە دۆخی چاودێریکردندا API server هەر ١٥ چرکە جارێک Meta sync دەکات، تەنانەت ئەگەر dashboard دابخەیت؛ شاشەی `/live` هەر ٥ چرکە جارێک داتای سێرڤەر دەخوێنێتەوە.
7. پێش ئاشکراکردنی براوەکان، server یەک sync ـی کۆتایی سەرکەوتوو ئەنجام دەدات و پاشان ئەنجامەکە دادەخات.

لەبەر پاراستنی زانیاری، access token ـەکان بە AES-256-GCM کۆد دەکرێن و هیچ token ـێک بۆ React یان براوزەر نانێردرێت.