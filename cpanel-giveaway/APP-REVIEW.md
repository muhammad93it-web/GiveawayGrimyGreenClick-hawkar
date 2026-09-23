# Meta App Review resubmission guide

The previous rejection was for the screencast, not the allowed use case. This guide describes what to show with real Page data after the updated application is deployed and the Facebook Page is connected. Do not submit a simulated comment, fabricated profile, or a recording of a disconnected dashboard.

## Before recording

1. Open `https://giveaway.mang-herbal.com/?lang=en` in a fresh browser session. The English setting persists through the Meta callback. Check that the site is running this version and that the Facebook Page shown is the intended business asset.
2. Use an account that can grant access to that Page. Create or identify a real Page post with a real comment from an account whose profile fields Meta returns to this app. A fresh controlled comment is more reliable than old comments whose `from` field may be absent.
3. Connect Facebook with the three requested Page permissions (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`). Business Asset User Profile Access is a separate reviewed feature. If the authorization returns an error, read the dashboard's reason rather than recording a failed flow.
4. Select the Page and post, save the giveaway, and continue the comment import until the controlled comment appears. The admin-only **Recent Page comments** section shows the comment text and returned author name; the **Participant ranking** shows the person's name and count. A profile photo appears only if Meta returned one. Keep the visible **Facebook Page: name (ID)** line in frame.
5. For a Facebook Reel URL, the admin-only **Check a Facebook Reel** control can inspect up to 100 comments without changing the current giveaway. It first verifies that Meta identifies the Reel's creator as the configured Page. Its author counts and sample names describe only the returned page of results. This diagnostic is not a substitute for the end-to-end recording of a real comment in the app's giveaway view; Meta may withhold author identity until the separate profile-access feature is approved.

## Record one complete, readable flow

1. Start the recording before clicking **Connect Facebook**. Show the full Meta login or account-selection screen, then the permission and Page selection dialogs, and the user granting access. Do not show a password, recovery code, access token, app secret, or private configuration.
2. Return to the English dashboard. Pause on the Page selector showing the real Page name, then select the real post. Explain the **Save** and **Continue importing comments** controls with captions or callouts.
3. Show the controlled Page comment in the source Page or post, then the same comment under **Recent Page comments** in the app. Keep the Page identity line in frame. Highlight the author's returned name (and photo only when actually returned) and the comment text.
4. Show that the same person appears in **Participant ranking** with a comment count. Open **Live results** if it helps show the end-to-end result. Explain that a missing `from` author is not guessed or displayed as a person.
5. Capture at readable resolution, use English captions/tooltips naming each button and field, and keep the cursor actions slow enough for a reviewer to follow. Record separate short clips per requested permission if the review form calls for one per item; each clip should still include enough of the login/grant and Page context to stand alone.

## What each item demonstrates

| Review item | Visible evidence in the recording |
| --- | --- |
| `pages_show_list` | Meta Page selection, followed by the actual Page appearing in the dashboard's Facebook Page selector and identity line. |
| `pages_read_engagement` | The Page's posts populate the Post selector; the chosen post and its comment counts are used in the giveaway. |
| `pages_read_user_content` | A real comment from the chosen Page post is imported and its text appears in Recent Page comments. |
| Business Asset User Profile Access | The same comment's returned author name appears beside its text and in Participant ranking; a returned photo appears when available. The Page name and ID remain visible. |

## Suggested submission notes

> This app lets an authorized Facebook Page manager select a Page post, import its comments, and rank participants by comment count. In the English dashboard at `https://giveaway.mang-herbal.com/?lang=en`, the Page selector and “Facebook Page: name (ID)” identify the business asset. “Recent Page comments” displays the comment text and author name when Meta returns an author ID; “Participant ranking” displays the same person's name and comment count. A profile photo appears only when Meta returns it. The video begins before Facebook Login, shows the Page and permission grant, and then follows one real Page comment through import to these views. The app uses an interactive user OAuth flow, not a system user token.

This text describes the intended deployed flow. Verify every statement against the final recording before pasting it into the Meta submission. Approval is Meta's decision.
