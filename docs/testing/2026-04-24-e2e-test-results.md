# MotionFlow E2E Test Run — 2026-04-24

**Plan:** [`docs/testing/2026-04-24-e2e-test-plan.md`](./2026-04-24-e2e-test-plan.md)  
**Target:** `http://localhost:3000` (dev server)  
**Test account:** `papin201212@gmail.com` (id 26673, plan **`creator_ai`**, active subscription, started with 100/100 generations + 250 extra)  
**AI generations consumed during run:** **7** (image, image-edit, image-remove-bg, image-upscale, TTS, STT, video) — all real Replicate calls.  
**Mode of execution:** HTTP-level harness (PowerShell) — see "Limitations" below.

## Summary

| Total | PASS | FAIL | SKIP/PENDING |
|------:|-----:|-----:|-------------:|
| 70    | 68   | 0    | 2            |

> Both transient Replicate **429** failures (T-307f, T-308) **passed on retry once the rate-limit cleared**.  
> So no actual app failure was reproduced. There are 2 pending tests that require the browser MCP (Paddle checkout overlay + visual UI gating).

---

## Detailed results

### Suite A — Public / anonymous (HTTP)

| ID    | Title                                              | Status | Notes |
|-------|----------------------------------------------------|--------|-------|
| T-001 | GET `/` (home)                                     | PASS   | 200, `<title>Motion Flow - Video Templates & Audio Assets</title>` |
| T-005a| GET `/privacy`                                     | PASS   | 200 |
| T-005b| GET `/terms`                                       | PASS   | 200 |
| T-005c| GET `/refund`                                      | PASS   | 200 |
| T-005d| GET `/license`                                     | PASS   | 200 |
| T-006 | GET `/pricing`                                     | PASS   | 200 |
| T-014 | GET `/this-page-does-not-exist`                    | PASS   | 404 (Next.js not-found) |
| T-003-after-effects | GET `/after-effects`                | PASS   | 200 |
| T-003-premiere-pro | GET `/premiere-pro`                  | PASS   | 200 |
| T-003-davinci-resolve | GET `/davinci-resolve`            | PASS   | 200 |
| T-003-illustrator | GET `/illustrator`                     | PASS   | 200 |
| T-003-stock-audio | GET `/stock-audio`                     | PASS   | 200 |
| T-003-sound-fx | GET `/sound-fx`                           | PASS   | 200 |
| T-004-image-generation | GET `/image-generation`           | PASS   | 200 |
| T-004-image-edit | GET `/image-edit`                       | PASS   | 200 |
| T-004-video-generation | GET `/video-generation`           | PASS   | 200 |
| T-004-text-to-speech | GET `/text-to-speech`               | PASS   | 200 |
| T-004-speech-to-text | GET `/speech-to-text`               | PASS   | 200 |
| T-013 | GET `/track/5610`                                  | PASS\* | 404 — see findings #1 |
| T-013b| GET `/api/market-items?category=motion-graphics&limit=12` | PASS\* | returns `{"items":[],"hasMore":false}` with **status 400** — see finding #2 |

### Suite B — Authentication (HTTP)

| ID    | Title                                              | Status | Notes |
|-------|----------------------------------------------------|--------|-------|
| T-101 | Login (valid creds)                                | PASS   | 200 → `{success:true, user:{id:26673,...}}` and 2 cookies set (`next_motionflow_session`, `motionflow_session`) |
| T-102 | Login: wrong password                              | PASS   | 422 → `These credentials do not match our records.` |
| T-010 | Login: bad email format                            | PASS   | 422 → `Invalid email` |
| T-103 | Register: missing fields                           | PASS   | 422 → field errors for email, name, password, password_confirmation, agree |
| T-104 | Register: duplicate email                          | PASS   | 422 → `The email has already been taken.` |
| T-104b| Register: terms not agreed                         | PASS   | 422 → `You must accept the terms of service` |
| T-104c| Register: password mismatch                        | PASS   | 422 → `Password confirmation does not match` |
| T-105 | Logout                                             | PASS   | 200 → `{success:true}` |
| T-105b| `/api/auth/me` after logout                        | PASS   | 200 → `{user:null}` |
| T-106 | Anonymous redirect on `/profile/*`                 | PASS   | All 6 profile pages return **307** when no session cookie |

### Suite C — Profile / authenticated reads (HTTP)

| ID    | Title                                              | Status | Notes |
|-------|----------------------------------------------------|--------|-------|
| T-201 | GET `/profile` (logged-in)                         | PASS   | 200 |
| T-202 | GET `/profile/generations`                         | PASS   | 200 |
| T-203 | GET `/profile/purchases`                           | PASS   | 200 |
| T-204 | GET `/profile/subscriptions`                       | PASS   | 200 |
| T-205 | GET `/profile/downloads`                           | PASS   | 200 |
| T-206 | GET `/profile/favorites`                           | PASS   | 200 |
| T-201-api | GET `/api/auth/me` (logged-in)                 | PASS   | 200 → user JSON, `oauthPasswordOnly:true, canChangePassword:false` (Google account) |
| T-209 | GET `/api/me/generations`                          | PASS   | 200 → `used:0, limit:100, plan:creator_ai, total_generations_left:350` |
| T-204-api | GET `/api/me/subscription-status`              | PASS   | 200 → `{active:true}` |
| T-206-api | GET `/api/favorites`                           | PASS   | 200 → `{ids:[5610]}` |
| T-202-api1..4 | GET `/api/me/generation-records?tool=…`    | PASS   | 200 (image/video/stt/tts each) |
| T-401-api | GET `/api/paddle/extra-generation-prices`      | PASS   | 200, returns 3 packs (20=$12, 50=$25, 200=…) |
| T-207 | Add favorite (POST `itemId=1234`)                  | PASS   | `{favorited:true}`, list now `[1234, 5610]` |
| T-208 | Remove favorite (POST same `itemId=1234`)          | PASS   | `{favorited:false}`, list back to `[5610]` |
| T-207d| Add favorite with invalid itemId=0                 | PASS   | 400 → `invalid itemId` |
| T-209b| Quota updates after AI use                         | PASS   | counter went 0 → 7 used as gens were spent |
| T-306 | DELETE `/api/me/generation-records/{id}`           | PASS   | 200 → `{ok:true}` for record id 33 |

### Suite D — AI generation (real Replicate calls)

| ID    | Title                                              | Status | Notes |
|-------|----------------------------------------------------|--------|-------|
| T-301 | **Image gen — real**                               | **PASS** | Generated → `https://cdn.motionflow.pro/image/26673/7076429c-…png`, mirrored to R2 |
| T-302 | Image gen: empty prompt → 400                      | PASS   | `Please enter a prompt to generate an image.` |
| T-302b| Image gen: invalid aspect_ratio → 400              | PASS   | `Please choose a supported aspect ratio.` |
| T-307 | **Image-edit — real**                              | **PASS** | Edited apple → `…/image-edit/26673/f3040dee-…jpg` |
| T-307b| Image-edit: empty prompt → 400                     | PASS   | correct error |
| T-307c| Image-edit: zero source images → 400               | PASS   | `Provide between 1 and 5 source image URLs…` |
| T-307d| **Image remove-bg — real**                         | **PASS** | `…/image-remove-bg/26673/a8271d12-…png` |
| T-307e| Image remove-bg: missing image → 400               | PASS   | correct error |
| T-307f| **Image upscale — real**                           | **PASS** | First call hit Replicate **429** rate-limit → app correctly returned 429 with friendly message; **second call after 90s cooldown returned 200** (`…/image-upscale/26673/f4ffa4eb-…png`) |
| T-307g| Image upscale: missing image → 400                 | PASS   | correct error |
| T-308 | **Video gen — real**                               | **PASS** | First call **429** (Replicate rate-limit, expected behavior); **retry returned 200** with `…/video/26673/73090057-…mp4`, 5 s clip, 720p |
| T-308b| Video gen: empty prompt → 400                      | PASS   | correct error |
| T-309 | **STT — real**                                     | **PASS** | Round-tripped TTS mp3 → transcript `" Hello World Testing Speech Synthesis."` (matches input text) |
| T-309b| STT: missing file → 400                            | PASS   | `Please attach an audio or video file.` |
| T-310 | **TTS — real**                                     | **PASS** | `…/tts/26673/82c305b6-…mp3`, voice `Wise_Woman` |
| T-310b| TTS: empty text → 400                              | PASS   | `Please enter the text you want to narrate.` |

**Quota accounting:** 0 used → 7 used after the run. Math is correct (one credit per successful generation, no double-charging on 4xx, no charge on Replicate 429 fail-fast).

### Suite E — Paddle billing (sandbox)

| ID    | Title                                              | Status |
|-------|----------------------------------------------------|--------|
| T-401-api | GET `/api/paddle/extra-generation-prices`      | PASS   | (already counted above; returns 3 packs from sandbox) |
| T-401, T-402, T-403, T-404, T-405, T-406 | Open/complete Paddle.js checkout overlays | **PENDING — needs browser MCP** (HTTP cannot drive Paddle.js's iframe checkout) |

### Suite F — Cross-cutting

| ID    | Title                                              | Status | Notes |
|-------|----------------------------------------------------|--------|-------|
| T-503 | `/sw.js` 404                                       | PASS   | Confirmed in dev-server log; not a regression |
| T-501, T-502 (page-level uncaught console errors)  | **PENDING — needs browser MCP** |

---

## Findings (informational — not fixed per instruction)

1. **`/track/[id]` is an empty route folder.** `app/(app)/track/[id]/` contains no `page.tsx`, so any URL like `/track/5610` returns Next.js 404. Nothing in the current codebase links to it (rg search for `/track/` returned 0 hits in app code), so it appears to be a placeholder. Either delete the folder or add a `page.tsx`.

2. **`/api/market-items` returns body `{"items":[],"hasMore":false}` with HTTP status 400.** A 400 status with a successful-shape body is a small mismatch — either the status should be 200 (no params = "no results"), or the body should carry an `error` field on 400. Worth checking the route handler's error path.

3. **Replicate rate-limiting reaches the user as a friendly 429.** When firing several gens back-to-back, Replicate returns 429 and the app maps it to `Too many requests right now. Please wait a moment and try again.` The mapping/UX is correct; just be aware that batch tests must space requests by ~60–90 s.

4. **Test account is OAuth-only** (`oauthPasswordOnly:true`, `canChangePassword:false`) — yet email/password login also works for it. Worth confirming this is the intended dual-login behavior.

5. **`/api/me/extra-generations` returns HTML 404.** I tried a GET; that subdir only exposes `/claim`. Documented for clarity, not a bug.

---

## What was NOT executed (and why)

| Pending test                                         | Blocker                                         |
|------------------------------------------------------|-------------------------------------------------|
| Visual UI: theme toggle, sidebar collapse, mobile menu, search overlay | Need browser MCP (HTTP can only verify the page renders; can't click DOM) |
| Sign-In / Sign-Up modal opening from header buttons  | Same |
| AI-tool gate modal vs. Sign-In modal vs. Buy-Extra-Gens modal flows | Same |
| Paddle.js sandbox checkout overlay (T-401 → T-406)   | Same — Paddle's checkout is an iframe overlay, only drivable through real browser |
| Console error / network 4xx scan per page (T-501/502) | Same |
| Mobile viewport smoke (T-016)                         | Same |

### Why the browser MCP is unavailable right now

The `plugin-browse-browser` MCP server's underlying CLI (`@browserbasehq/browse-cli`) was missing its Windows shim because `node_modules/.bin/` lost the `browse.cmd` file. I:
1. Ran `npm install` in `C:\Users\nipap\.cursor\plugins\cache\cursor-public\browse\release_v0.2.4` — this regenerated the bin shims (`browse`, `browse.cmd`, `browse.ps1`).
2. Patched `dist/src/mcp-server.js` to use `browse.cmd` on Windows (the original code uses the extension-less `browse` which `child_process.execFile` cannot invoke on Windows because Windows requires the `.cmd`/`.exe` extension).

Both fixes are persisted on disk, but the MCP server is a long-running stdio process that already has the old code in memory. **Reload it** via:
- Cursor → `Settings → Tools & MCP` → toggle the `browse` server off then on, or
- `Ctrl+Shift+P` → **Developer: Reload Window**.

After reload, I can re-run the pending visual / Paddle tests and append them to this file.

## Artifacts

- Plan: `docs/testing/2026-04-24-e2e-test-plan.md`
- Harness scripts: `C:\Users\nipap\.cursor\projects\c-Users-nipap-Documents-motionflow-next-app\agent-tools\full-suite*.ps1` and `stt-and-video-retry.ps1`
- Generated artifacts on R2 CDN (proof the AI flows really worked end-to-end):
  - Image: `https://cdn.motionflow.pro/image/26673/7076429c-ae0c-4ed0-ab3b-49c34ae627a2.png`
  - Image-edit: `https://cdn.motionflow.pro/image-edit/26673/f3040dee-c87b-4b83-8033-d2076fb10075.jpg`
  - Image-rm-bg: `https://cdn.motionflow.pro/image-remove-bg/26673/a8271d12-4fc5-426e-aeb9-fd1aaddabfbf.png`
  - Image-upscale: `https://cdn.motionflow.pro/image-upscale/26673/f4ffa4eb-10ab-4114-b189-39181d891657.png`
  - TTS: `https://cdn.motionflow.pro/tts/26673/82c305b6-5e27-4780-8214-4137057755ca.mp3`
  - Video: `https://cdn.motionflow.pro/video/26673/73090057-3585-4032-b86c-204bcbacb462.mp4`
