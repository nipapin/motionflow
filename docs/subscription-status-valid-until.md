# CEP subscription expiry / Valid until

`GET /api/me/subscription-status` accepts the existing website session cookie or CEP Bearer token through `resolveRequestUser`. Authenticated responses preserve `authenticated`, `active`, and `generation_plan` and include the full existing `ActiveSubscriptionSummary` as `subscription` (or `null`). No subscription IDs, tokens or user details should be logged during verification.

`subscription.currentPeriodEnd` is the real paid-access end of the selected Motion Flow catalog subscription. It uses the same `rowPeriodEnd()` as Profile → My subscriptions: the later valid stored value of `ends_at` and `paddle_billing_period_ends_at`. A cancellation with future paid access still returns its end date. Missing dates remain `null`; no period is extrapolated. Author subscriptions and one-time generation packs are excluded from the platform summary.

Paddle webhook persistence stores UTC DATETIME (`toMysqlDateTime()` in `lib/paddle-server.ts`). Subscription queries read date strings explicitly so mysql2 cannot interpret these values in the Node host's local timezone. API values are ISO 8601 UTC (`...Z`), preserving explicit input offsets. This change is scoped to subscription queries; the shared database pool's timezone is not changed.

For platform clients, `GET /api/cep/me` uses that same summary for `subscription.renews_at`. This legacy field name also represents paid access ending after cancellation; it does not promise that another charge will occur. Existing `status`/plan fields and author-client payloads are preserved. The subscription-status response is private/no-store.

## Production diagnosis (2026-10-29)

Public `/api/deploy-health` reported release `645dd0e0608da6a17496dfac717fd97dc88c9ee7-54-1`. The committed subscription-status implementation at this SHA returns only authenticated/active/generation_plan. The implementation returning `subscription` was an uncommitted local change, so it never reached the CI build. A missing database date cannot remove an explicitly returned object/key; that is a deployment/code difference, not evidence of absent data. No authenticated production payload was inspected.

Only one Next.js subscription-status route was found. Production reverse-proxy configuration was not available to inspect. The `motionflow` SSH alias is not configured in this environment and GitHub CLI is unavailable.

## Deploy

Ship these files together through the normal build/release workflow:

- `lib/subscriptions.ts`
- `app/(main)/api/me/subscription-status/route.ts`
- `app/(main)/api/cep/me/route.ts`
- `scripts/test-subscription-status.mjs` (verification)

No database migration, new environment variable or backfill is required. Never fill missing end dates with the current time. Existing rows missing both dates require separate reconciliation with their authoritative billing records.

After deployment, check the release in `/api/deploy-health`. Using an existing authorized cookie and CEP token in a private client, verify the subscription-status summary, `/api/cep/me` for a platform client, and the matching My subscriptions row. Do not paste credentials, full account responses or authorization headers into logs/chat. If the response still has the old shape, inspect the active PM2 release and reverse-proxy target before changing billing data. Restarting the same old artifact will not add the missing fields.

## Regression checks

```bash
TZ=Asia/Bangkok node --test scripts/test-subscription-status.mjs
TZ=Pacific/Honolulu node --test scripts/test-subscription-status.mjs
```

Covers cookie/Bearer auth, active and cancelled-but-paid subscriptions, absent/expired subscriptions, unknown dates, UTC/offset serialization, the selected subscription row, exclusion of author subscriptions and extra credits, and unchanged author-client responses.
