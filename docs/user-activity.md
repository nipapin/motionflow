# User activity

Administrators can open **Users → user card → Activity** (`/profile/users`).
The feed is restricted using the same permission check as account management.
It shows the selected account's events, newest first, with type filters and keyset pagination (50 per page).

## Sources

| Source | Coverage | Meaning |
| --- | --- | --- |
| `user_activity` | New catalog downloads, extension pack downloads/updates, Gal effect file links, stock downloads, caption style downloads and generated-file downloads | `requested`, then `issued` or `failed`; issued means a file stream or storage link was handed to the client |
| `subscription_downloads` | Existing subscription / free catalog download requests | Legacy requests; success and source were not recorded |
| `generation_records` | Existing and new image, image edit, background removal, upscale, SVG, video, TTS, STT and voiceover results | Completed or failed; new records also identify website vs extension |
| `user_activity` | Captions, chapters and sections responses | One completed/failed event per authenticated call, including zero-credit calls; no duplicate per-credit events |
| `cep_client_sessions` | Existing and new extension environment reports | A reported session, with host and extension version; existing 12-hour deduplication still applies |
| `user_activity` | Changes in installed and active extension pack snapshots | Newly detected, changed version, disappeared, reported active/inactive |

Catalog requests made with a one-time purchase are now logged too. Subscription download records are linked to their new activity event and suppressed in the legacy feed, so they appear once. Existing repeated download requests are retained individually.

Pack reports are validated against the author's catalog. Snapshot updates and activity events share a transaction; a lock on the owning device serializes concurrent reports. Identical reports create no additional events. A first snapshot establishes what is present at reporting time; it cannot establish when the original installation happened.

## Storage and deployment

The new table is lazily created on first use, following the project's existing database convention. Environments with managed DDL can apply `db/migrations/2026_10_26_user_activity.sql` before deploying. No backfill or modification of existing history is required.

The new history records the verified numeric Motionflow user ID. External Odin identities remain in their own namespace and are never coerced into Motionflow IDs. Activity metadata does not store email addresses, prompts, AI output, tokens, purchase codes, signed URLs or raw error messages. Account deletion removes `user_activity` rows along with other account telemetry.

Writes are awaited but fail open: a failure to store analytics must not block downloads or panel reports. Failed writes emit server log messages. The admin feed reports unavailable optional legacy tables and returns an error for database failures instead of showing misleading empty history.

Timestamps use the existing database wall clock (`NOW`); the UI displays them without converting them to the browser's timezone or inventing a UTC offset. Pagination preserves microseconds, source ordering and numeric IDs to avoid gaps for events sharing a timestamp.

## Limits

- Issuing a download link or starting a stream does not prove the entire file was received. Network failures after the response begins are not measurable by this journal.
- Direct public/CDN links and anonymous installer/demo downloads cannot reliably identify a person. These do not appear in an account's history.
- Pack activity depends on reports from the installed extension. It does not prove an effect was applied in an Adobe project or measure how long it was used.
- Older records lack source/device information; the UI labels this explicitly. Undated or zero-date legacy rows are omitted because they cannot be placed in a dated history. Previously unrecorded actions cannot be reconstructed.
- The feed tracks the server actions listed above, rather than arbitrary page views, clicks or client-only editing actions.

## Verification

```powershell
node --test scripts/test-user-activity.mjs scripts/test-admin-user-deletion.mjs scripts/test-caption-highlights.mjs
node --env-file=.env scripts/test-user-activity-db.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The database integration script creates random, disposable fixture tables and removes them afterward. It does not read or change real users, downloads or generations. It exercises the actual migration, persistence, legacy deduplication, pagination, category filters and concurrent panel snapshot handling.
