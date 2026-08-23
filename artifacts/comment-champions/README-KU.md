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
```

- ئەگەر `META_REDIRECT_URI` دانەنرێت، backend callback URL ـەکە لە دۆمەینی داواکارییەکە دروست دەکات.
- `META_ALLOWED_PAGE_ID` تەنها ئەو پەیجە و Instagram Business ـە بەستراوەکەی ڕێگەپێدەدات؛ هەژمارێکی دیکە ناتوانێت شاشەی لایڤ بگۆڕێت.
- dashboard هەمیشە callback URL ـی ڕاست پیشان دەدات تا کۆپی بکەیت بۆ **Valid OAuth Redirect URIs**.
- `SESSION_SECRET` کلیلی کۆدکردنی token ـەکانیشە؛ دوای هەڵگرتنی token نابێت بگۆڕدرێت، مەگەر پەیوەندی Meta دووبارە دروست بکەیتەوە.

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