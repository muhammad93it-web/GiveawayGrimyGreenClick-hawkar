---
name: cPanel sync scheduling
description: Host-specific limit for the scheduled Meta comment synchronization.
---

Schedule the comment synchronization no more often than once every five minutes.

**Why:** The cPanel Cron Jobs interface for the deployed host explicitly limits jobs to a minimum interval of five minutes.

**How to apply:** Use the five-minute schedule for the PHP synchronization command and describe new comments as arriving within roughly five minutes; do not promise minute-by-minute refreshes on this host.