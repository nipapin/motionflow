# MotionFlow End-to-End Test Plan

**Date:** 2026-04-24  
**Target environment:** `http://localhost:3000` (local dev server, already running)  
**Tooling:** Cursor browser-automation MCP (real Chrome) — no test files committed to the repo  
**Strategy:** discover → run → record pass/fail; do **not** fix issues in this session.

---

## 0. Preconditions / supplied secrets

| Item                  | Source                                                                |
| --------------------- | --------------------------------------------------------------------- |
| Dev server running    | `npm run dev` on `http://localhost:3000` (verified via terminal log)  |
| Test user             | Email + password supplied by repo owner in chat                       |
| Paddle env            | `sandbox` (`NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox` in `.env`)        |
| Paddle test card      | `4242 4242 4242 4242`, exp `12/30`, CVC `100`                         |
| Replicate calls       | Real API calls — small charge per generation                          |
| Google OAuth          | Out of scope (manual interaction required)                            |

---

## 1. Scope

| Layer                      | In scope | Out of scope                                             |
| -------------------------- | -------- | -------------------------------------------------------- |
| UI / browser flows         | Yes      | —                                                        |
| API routes                 | Indirectly via UI calls | Direct curl/Postman                       |
| Mobile viewport            | Smoke pass at 390×844 | Full responsive matrix                      |
| Email verification         | UI surface only | Real inbox checks                                |
| Production deploy          | —        | All testing on local dev server                          |
| Performance / load testing | —        | Not requested                                            |
| Webhook signature verify   | —        | Server-side only; no public endpoint reachable           |

---

## 2. Test environment matrix

| Aspect             | Value                                          |
| ------------------ | ---------------------------------------------- |
| Browser            | Chrome (via Cursor browser MCP, local mode)    |
| Default viewport   | 1440 × 900                                     |
| Mobile viewport    | 390 × 844 (smoke only)                         |
| Theme              | Toggle dark ↔ light at least once              |
| Auth state         | Anonymous, then logged-in user                 |

---

## 3. Test suites

Each test below has a stable ID `T-###`. Final report uses these IDs.

### Suite A — Public / anonymous

| ID    | Flow                                          | Pass criteria                                                          |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------- |
| T-001 | Home page loads (`/`)                         | 200, header + sidebar + hero/sections render, no console errors        |
| T-002 | Theme toggle (dark ↔ light)                   | Icon switches, `class="dark"` toggles on `<html>`                       |
| T-003 | Sidebar navigation — categories               | Each link in sidebar reaches its page (After Effects, Premiere Pro, DaVinci, Illustrator, Stock Music, Sound FX) |
| T-004 | Sidebar navigation — AI tools                 | Image Gen, Image Edit, Video Gen, TTS, STT pages load                   |
| T-005 | Footer / legal pages                          | `/privacy`, `/terms`, `/refund`, `/license` all 200                     |
| T-006 | Pricing page renders (`/pricing`)             | Both tiers visible, monthly/yearly toggle works                         |
| T-007 | Search input accepts text                     | Typing in header search updates state, no crash                         |
| T-008 | Sign-In modal opens / closes                  | Click "Sign In" → modal opens, close button closes it                   |
| T-009 | Sign-Up modal opens                           | Click "Sign Up" → modal opens on the Sign-Up tab                        |
| T-010 | Email validation in sign-in                   | Bad email → field error                                                 |
| T-011 | AI tool gate when anonymous                   | `/image-generation` "Generate" → opens sign-in modal                    |
| T-012 | Pricing CTA when anonymous                    | Plan buttons show "Sign in" or open sign-in modal                       |
| T-013 | Track / item detail (`/track/[id]`)           | At least one item from home opens its detail modal/page                 |
| T-014 | 404 page                                      | Unknown URL returns Next.js 404 page                                    |
| T-015 | Sidebar collapse / expand                     | Collapse, expand, persists in URL/localStorage if implemented           |
| T-016 | Mobile hamburger menu                         | At 390×844 the menu opens, links work, closes on click                  |

### Suite B — Authentication

| ID    | Flow                                            | Pass criteria                                                  |
| ----- | ----------------------------------------------- | -------------------------------------------------------------- |
| T-101 | Email/password login (valid)                    | Modal closes, header shows user name, `/api/auth/me` returns user |
| T-102 | Email/password login (wrong password)           | Inline error, modal stays open                                 |
| T-103 | Sign-up validation (missing fields)             | Field errors shown, no API call                                |
| T-104 | Sign-up validation (terms not agreed)           | Submit blocked or error                                        |
| T-105 | Sign-out                                        | User dropdown → Sign Out → header reverts to Sign In/Sign Up   |
| T-106 | Protected pages redirect when logged-out        | Visiting `/profile/*` while logged-out shows sign-in surface   |
| T-107 | Session persists across reload                  | Reload page → still logged in                                  |

### Suite C — Profile area (logged-in)

| ID    | Flow                                            | Pass criteria                                                  |
| ----- | ----------------------------------------------- | -------------------------------------------------------------- |
| T-201 | `/profile` loads                                | Profile settings card renders, no console errors                |
| T-202 | `/profile/generations` loads                    | Lists current usage/quota; tabs (image/video/stt/tts) switch    |
| T-203 | `/profile/purchases` loads                      | Returns 200, list state correct (empty or items)                |
| T-204 | `/profile/subscriptions` loads                  | Returns 200, current sub state matches API                      |
| T-205 | `/profile/downloads` loads                      | Returns 200                                                     |
| T-206 | `/profile/favorites` loads                      | Returns 200                                                     |
| T-207 | Favorite a marketplace item                     | Click favorite → POST `/api/favorites` → appears in `/profile/favorites` |
| T-208 | Unfavorite                                      | DELETE → disappears                                             |
| T-209 | Generations quota badge updates                 | Badge in header / generators reflects `/api/me/generations`     |

### Suite D — AI generation (uses real Replicate quota)

| ID    | Flow                                            | Pass criteria                                                                |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| T-301 | Image generation success                        | Prompt → generate → image returned, recorded in `/profile/generations`        |
| T-302 | Image generation — empty prompt                 | Submit blocked (button disabled or no API call)                              |
| T-303 | Image generation — style/ratio change reflects in payload | Network call body includes selected `style` & `aspect_ratio`        |
| T-304 | Recent images list appears after gen            | At least one card appears under "Recent"                                     |
| T-305 | Repeat-recent action restores form              | Click rotate icon → prompt/style/ratio pre-filled                            |
| T-306 | Delete a recent generation                      | Trash icon → DELETE `/api/me/generation-records/{id}` → card removed         |
| T-307 | Image-edit page                                 | Upload image, prompt → edited image returned                                 |
| T-308 | Video generation success (1 short clip)         | Prompt → generate → video URL returned                                       |
| T-309 | Speech-to-Text                                  | Upload short audio → transcript returned                                     |
| T-310 | Text-to-Speech                                  | Enter text, voice → audio URL returned, plays                                |
| T-311 | Generation gating when over quota               | After exhausting plan, generator opens "Buy extra generations" dialog        |

### Suite E — Paddle billing (sandbox)

| ID    | Flow                                            | Pass criteria                                                                       |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| T-401 | Open Creator monthly checkout                   | Paddle.js checkout overlay loads (sandbox)                                          |
| T-402 | Complete Creator monthly checkout w/ test card  | Checkout success → webhook hits `/api/paddle/webhook` → subscription appears in `/profile/subscriptions` |
| T-403 | Open Creator-AI yearly checkout                 | Overlay loads with the correct price ID                                             |
| T-404 | Buy extra-generations pack (20)                 | Overlay loads, complete with test card, generation balance increases (T-209)         |
| T-405 | Pricing toggle monthly ↔ yearly                 | Prices update, plan price IDs change                                                |
| T-406 | Already-subscribed UX                           | When sub exists, button shows "Current plan" / upgrade preview                       |

### Suite F — Cross-cutting / regressions

| ID    | Flow                                            | Pass criteria                                            |
| ----- | ----------------------------------------------- | -------------------------------------------------------- |
| T-501 | Console errors per page                         | No uncaught exceptions on first paint of each major page |
| T-502 | Network 4xx/5xx tracking                        | No unexpected 4xx/5xx for happy paths                    |
| T-503 | Service worker request                          | `/sw.js` 404 already known; flag if it changes           |

---

## 4. Execution order

1. Suite A (anonymous flows) — fastest, sets baseline.
2. Suite B (auth) — unblocks C, D, E.
3. Suite C (profile read-only).
4. Suite D (AI generation) — incurs real Replicate cost.
5. Suite E (Paddle sandbox) — incurs no real cost but mutates user state.
6. Suite F runs continuously throughout (monitor `browser_console_messages` and `browser_network_requests`).

## 5. Reporting format

Final report is a single table:

```
ID    | Suite | Title                          | Status | Notes / failing assertion
------|-------|--------------------------------|--------|--------------------------
T-001 | A     | Home page loads                | PASS   | -
T-011 | A     | AI tool gate when anonymous    | FAIL   | Generate button stayed disabled, modal never opened
...
```

Per user instruction: **failures are recorded, not fixed.**

## 6. Risks / constraints

- Replicate calls cost money — Suite D will spend real credits.
- Paddle sandbox checkout still requires a card form fill — handled with the published Paddle sandbox test card.
- Some paths (Google OAuth, email verification, real webhook delivery from Paddle's cloud) are out of scope without manual interaction or a public tunnel.
- Tests are observational; environment state (existing favorites, downloads, subscription) may pollute results — noted per test where relevant.
