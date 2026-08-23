---
name: Meta comment author privacy
description: How to handle Facebook comments when Graph returns content but omits the author object.
---

Treat an absent Facebook comment `from` object as an authoritative Meta privacy omission, even when the Page token is valid and all configured Page read permissions are granted. Do not infer, scrape, or manufacture commenter names, IDs, or profile photos; keep the anonymous fallback.

**Why:** A real Graph API v26 request using the selected Page's token successfully returned all comments while omitting `from` from every comment. The freshly issued user token had `pages_show_list`, `pages_read_engagement`, and `pages_read_user_content` granted, so another OAuth retry cannot guarantee that Meta will expose visitor identities.

**How to apply:** Preserve privacy-safe anonymous participants whenever `from` is absent. App Review and Live mode may broaden which users the app can serve, but they must not be presented as a guarantee that Meta will return names or photos.