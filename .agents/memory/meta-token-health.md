---
name: Meta token health
description: Security and concurrency rules for checking Meta user and Page token health.
---

Do not use Meta's token-debug endpoint for routine health checks because its official request format places the inspected token in the query string. Capture expiry from the OAuth exchange response, and validate both user and Page/Instagram credentials with minimal Graph identity requests that carry tokens only in authorization headers.

**Why:** Tokens must stay out of URLs and logs. Also, an old health check or sync may finish after reauthorization; without a credential-generation guard, its result can incorrectly restore an expired or revoked state over fresh credentials.

**How to apply:** Persist only safe health metadata. Rotate an opaque authorization generation on every successful OAuth callback, condition every asynchronous health/auth-failure write on the generation it inspected, and ignore stale results after a newer authorization wins.