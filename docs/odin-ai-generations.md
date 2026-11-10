# Odin AI generations

Odin Pro subscribers receive 100 generations per billing period. Annual and
Lifetime accounts receive 100 monthly from the purchase date. Registered unpaid
accounts receive 5 monthly from registration. Each Seat has an independent quota.
Short months clamp to the last day and restore the original day afterwards.
Cancellation retains paid rights through expiry; full refund/chargeback selects
the registration-based trial allowance immediately. Previous usage in that same
trial period remains spent. Nothing carries over. Explicit administrative access
blocks deny all generations; sandbox payments do not grant paid AI quota.

The quota
is shared by Captions, Chapters and Silence Remover (which calls Captions).
Existing duration-based costs apply: one generation per started 5 minutes.
Section regeneration costs one. Combined Captions/Chapters uses the existing
signed receipt, bound to the namespaced Odin account ID, to avoid a second charge.
There are no Odin extra-credit purchases or arbitrary credit top-ups.

The CEP panel sends its `odincep_` Bearer token to Motionflow AI endpoints.
`lib/odin-ai.ts` verifies it against the fixed Odin `/api/cep/me` endpoint on every
request, including a second check after provider work and before commit. The
version-2 allocation must contain a valid plan, limit, period ID and UTC bounds.
Missing or invalid attestations fail closed. Request-body identity and cookies cannot replace a revoked
Odin token. Subscription seats follow the Odin site's existing access rule.
Odin user IDs are namespaced strings and are never used as Motionflow DB IDs.

Usage lives in `odin_ai_period_usage`, keyed by account and server-attested period.
The new ledger starts empty so existing active users receive their full 100;
the old `odin_ai_generations` table is retained without carrying over its usage.
Apply `db/migrations/2026_11_10_odin_ai_period_usage.sql` before deployment.

`withOdinAiOperation` acquires a MySQL account lock before paid provider work.
Concurrent operations receive 409 `OPERATION_IN_PROGRESS`. A successful result
and its debit commit together in one InnoDB transaction. Failures, timeouts and
cancellation debit zero; a failed SQL/cache write rolls back the debit. Retries
must reuse their `Idempotency-Key` or `operationId` with the same payload, tool,
account and period. Completed requests replay without a provider call/debit.
A different ID is a new operation. CEP does not automatically retry paid work.
Signed Captions→Chapters receipts are single-use across operations, but the
same failed operation may retry its own Redis claim.

`odin_ai_operations` retains successful response bodies, including transcripts,
for retries. There is no automatic pruning job in this change; a future retention
job must retain records throughout their active allocation period.

Protected caption project downloads validate the requested brand before file
lookup/signing. Odin tokens authorize only Odin with active paid library access;
author CEP tokens require their registered brand and that author's subscription.
Motionflow web/platform preserves its existing Gal catalog entitlement. A
supplied invalid Bearer token never falls back to a logged-in cookie identity.

Apply Odin's PostgreSQL billing migration, run its read-only
`node scripts/backfill-ai-billing.mjs`, review it, then run with `--apply`.
The backfill verifies original dates and the latest order before writing.
Deploy Odin's account/webhook changes, then this app's version-2 service, then
distribute the rebuilt Odin CEP panel. The coordinated switch must avoid serving
legacy account responses to the new metering service. No new provider
credentials are required: the existing Motionflow AI providers are reused.
Odin caption catalogs use `Odin Pro Captions` in the existing public/private R2
buckets rather than falling back to another brand's catalog.

Local verification (no production calls; integration tests use a guarded test DB):

```sh
node --experimental-strip-types --test scripts/test-odin-ai.mjs
node --experimental-strip-types --test scripts/test-odin-ai-integration.mjs
node --test scripts/test-generation-cost.mjs scripts/test-author-generation-credits.mjs scripts/test-ai-usage.mjs
npx tsc --noEmit --incremental false
```

Integration tests require `ODIN_AI_TEST_ENV` pointing to a localhost
`codex_odin_ai_test_*` MySQL database, and the adjacent Odin checkout. Production
connection settings are refused. Full HTTP/Redis/Adobe setup, accounts, build
commands, scenario results and rollout are in the adjacent Odin repository:
`docs/odin-ai-verification-2026-11-10.md`. No production deployment or credit
allocation was performed during local verification.
