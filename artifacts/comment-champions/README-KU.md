# گیادەرمانی سروشتی ڕانیە — ڕێبەری دەستی پێکردن

ئەم پڕۆژەیە وێب ئەپێکی کوردیی RTL ـە بۆ ڕیزبەندی کۆمێنتەکانی پۆستەکانی فەیسبووک و ئینستاگرام و پیشاندانی ئەنجامەکان بە شێوەی لایڤ.

## ئەوەی ئامادەیە

- داشبۆردی بەڕێوەبردن بە کوردیی سۆرانی
- شاشەی `/live` بۆ پیشاندانی ڕیزبەندی لە مۆبایل، TV یان لایڤ
- ڕووکارێکی تەواو ڕیسپۆنسیڤ بۆ مۆبایل
- لۆگۆی گیادەرمانی سروشتی ڕانیە
- داتای نموونە بۆ بینینی شێوەی کارکردن

> **تێبینی:** وەرگرتنی کۆمێنتی ڕاستەقینەی Meta هێشتا زیاد نەکراوە. پێویستی بە Meta App، پەیوەستکردنی OAuth، و API ـی سێرڤەر هەیە.

## لە کوێ پڕۆژەکە کار بکەیت؟

باشترین هەڵبژاردە لەسەر کۆمپیوتەر:

1. [VS Code](https://code.visualstudio.com/) دابەزێنە.
2. [Node.js LTS](https://nodejs.org/) و `pnpm` دابەزێنە.
3. فایلە ZIP ـەکە بکەرەوە.
4. لە VS Code، فۆڵدەری سەرەکی پڕۆژەکە بکەرەوە.
5. Terminal بکەرەوە و ئەم فرمانانە بنووسە:

```bash
corepack enable
pnpm install
```

لە macOS یان Linux بۆ ڕاکردنی وێب ئەپەکە:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/comment-champions run dev
```

لە Windows PowerShell:

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; pnpm --filter @workspace/comment-champions run dev
```

پاشان لە براوزەر بکەرەوە:

```text
http://localhost:5173
```

## بڵاوکردنەوە لە دەرەوەی Replit

ئەم وێب ئەپە Vite/React ـە و دەتوانیت لە Vercel، Netlify، Cloudflare Pages یان هەر هۆستێکی static بڵاوی بکەیتەوە.

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
   - `pages_read_user_engagement`
   - `pages_manage_engagement` تەنها ئەگەر دەتەوێت کۆمێنت وەڵام بدەیت، بشاریتەوە یان بەڕێوەی ببەیت
   - `instagram_basic`
   - `instagram_manage_comments` تەنها ئەگەر کارکردن لەگەڵ کۆمێنتی ئینستاگرام پێویست بێت
9. لە کاتی development، تەنها تۆ و ئەو test user ـانەی لە Roles زیادکراون دەستگەیشتن دەبینن. بۆ بەکارهێنەرانی دیکە، پێویستە Meta App Review داواکاری بکەیت و بەکارهێنانی هەر مۆڵەتێک ڕوون بکەیتەوە.
10. **App Secret** و access token ـەکانت هەرگیز لە frontend، GitHub، یان چاتدا مەخە. تەنها لە environment variables ـی سێرڤەر هەڵیانبگرە.

## پەیوەستکردنی Instagram

ئەگەر Instagram Business/Creator ـەکەت بە Facebook Page بەستراو بێت، دەتوانیت بە Facebook Login for Business توکن و Page ID وەرگریت و پاشان Instagram account ـە پەیوەستکراوەکە بدۆزیتەوە. دۆکیومێنتی فەرمی Meta بۆ ئەم ڕێگایە:

- [Facebook Pages API](https://developers.facebook.com/docs/pages-api/)
- [Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/)
- [Instagram comment moderation](https://developers.facebook.com/docs/instagram-platform/comment-moderation)

## پێش ئەوەی Meta API زیاد بکەیت

پێویستە backend زیاد بکەیت بۆ:

- پاراستنی App Secret و access token ـەکان
- دروستکردنی OAuth callback
- وەرگرتنی پۆست و کۆمێنتەکان لە Graph API
- ژماردنی کۆمێنتی هەر بەشداربوو
- ناردنی ڕیزبەندییە نوێکراوەکان بۆ داشبۆرد و `/live`

لەبەر پاراستنی زانیاری، هیچ token ـێک مەخە لە فایلەکانی React یان براوزەر.