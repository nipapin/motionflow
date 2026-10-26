# Marketplace analytics and public-page heatmaps

**Management → Market analytics** (`/profile/analytics`) is the main entry point. It is restricted to the existing account-management administrators.

The overview shows demand over the selected period, daily trends and ranked materials/tools. Filters cover dates (up to one year), market/extensions/AI, action, source and material/user search. Rankings can be sorted by views, selections, saves, downloads, paid item purchases, tool usage, users or recent activity. Open a material to see its global events and interacting users; account activity is a secondary drilldown.

## Data definitions

- **Views:** opening a product detail modal or a supported public item route. Public page visits are collected separately and do not inflate item views.
- **Selections:** clicks on product cards. These are events, rather than distinct people or a matched-user conversion funnel.
- **Saved:** additions to favorites during the period, recorded on the server. Removing a favorite does not erase the historical save action.
- **Downloads:** new file/link handoffs plus legacy subscription download requests. New failed/requested actions are excluded from the successful totals and remain visible in the activity feed. A handoff is not proof of full file receipt. Linked legacy records are excluded to prevent duplicates.
- **Purchases:** paid, currently active item licenses from `sold_items`, excluding canceled/revoked rows, zero-price rows and campaign/admin/gift grants. These are licenses, not unique checkout transactions or subscription revenue. Browser events cannot create purchases. Refunds/revocations can change past-period counts.
- **AI:** generation result records plus structured captions, chapters, sections and standalone highlight responses. Failed results remain in the feed and failure count.
- **Extensions:** reported pack state changes and file/pack requests through the existing server endpoints. These indicate reported state or requests, not proof that an effect was applied inside an Adobe project.
- **Users:** distinct identified account IDs. Anonymous visitors can contribute views/selections and are labeled explicitly; they are not fabricated accounts.

Existing download, purchase and AI histories are queried directly. Views, selections, saves and heatmaps have no historical backfill. Missing optional legacy tables produce a partial-data notice; database failures produce an error rather than fabricated zero metrics. Dates follow the database wall clock. AI prompts, output URLs, purchase codes and credentials are never returned by the overview API.

## Heatmaps

The **Page heatmaps** tab separates the public URL, approximate screen width (80px buckets) and release/layout version. Layers show clicks/taps, cursor movement and cursor dwell. Scroll reach reports what share of sampled page visits reached 25%, 50%, 75% and 100% of the document.

Heatmaps store daily totals on a 40×200 normalized document grid, not raw cursor trajectories or per-user recordings. Heatmap tables contain no user/account identity. A sampled visit has an ephemeral, in-memory random ID; there is no new persistent analytics cookie or fingerprint. Signed-in market item events use the server-verified account ID; deletion anonymizes these events.

The current-page iframe preview is read-only. Its layout can differ from the original visit because dynamic content, product positions, personalization and release changes can move elements. Treat the overlay as approximate interaction density, not gaze/attention measurement. Cursor dwell stops after five seconds without pointer movement; hidden or unfocused documents are not sampled. Touch devices contribute taps but no fabricated mouse movement. Embedded preview pages do not collect telemetry.

Only allowlisted public Next.js pages are collected. Profile/account, login/reset, checkout/payment and contact pages are excluded, as are inputs, textareas, editable fields, dialogs and the product modal overlay. No target text, form contents or query strings are collected. Browser Global Privacy Control and Do Not Track disable the browser collector. Admin visits are excluded on the client and the ingest server. Separately rendered author/legacy applications need the same collector integration before they can appear here; this implementation does not claim coverage of code running outside this Next.js app.

## Performance and controls

- No React state updates or rendering on pointer movement. The passive pointer handler only stores the latest coordinates and target.
- Cursor work is sampled at four times per second; document geometry is refreshed at most once per second.
- Heatmaps sample 20% of public page visits by default; market selections/views are independent of this sampling.
- Packets are flushed during idle time every 15 seconds and on page hide/navigation. Each packet is capped at 192 aggregate cells, 16 item events and 24KB on the server.
- Delivery uses `sendBeacon`, with a best-effort `fetch(..., keepalive: true)` fallback. There are no unbounded queues or automatic retries.
- The ingest API enforces an origin check, streamed body-size limit, strict payload validation and short-lived IP-hash rate limits. Identity is resolved from the authenticated session, never supplied by the browser.
- Packet IDs and item-event IDs are idempotent. Database transactions keep duplicate packets from adding weight twice or reassigning a visit's context.
- Heatmap cells and visit metadata are retained for 90 days; packet deduplication IDs for seven days. Cleanup runs after responses, at most once an hour, in batches of 5,000 rows.

Environment switches:

```dotenv
MOTIONFLOW_MARKET_ANALYTICS=1
MOTIONFLOW_HEATMAP=1
MOTIONFLOW_HEATMAP_SAMPLE_RATE=0.2
```

Set the first switch to `0` to disable new browser analytics and saved-item events; previously existing download/AI operational records are unaffected. Set only `MOTIONFLOW_HEATMAP=0` to keep item analytics without collecting coordinate cells. Set the sample rate between 0 and 1. Release versions come from `RELEASE_COMMIT` / `RELEASE_ID`, then packaged `release.json`; development falls back to `market-v1`.

The application lazily creates its four new tables. Managed-DDL installations can apply `db/migrations/2026_10_26_market_analytics.sql` before deployment. Reporting joins the existing ledger tables without modifying their financial records. On larger histories, index legacy `created_at` columns before expanding reporting to long periods; ingestion writes are isolated to the new indexed tables.

## Checks

```powershell
node --test scripts/test-market-analytics.mjs scripts/test-user-activity.mjs scripts/test-admin-user-deletion.mjs scripts/test-caption-highlights.mjs
node --env-file=.env scripts/test-market-analytics-db.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The unit checks exercise 100,000 pointer events without DOM reads or network I/O in the handler, bounded sampling/packet sizes, private fields, sampling switches, origin/body validation and invalid filter rejection. Integration checks use disposable fixture tables to verify real SQL, idempotency, heatmap isolation/rollback, paid purchase definitions, legacy deduplication, global rankings, material-to-user drilldown and filtering. These checks establish bounded work; they do not assert zero overhead on every device or replace production Web Vitals monitoring.
