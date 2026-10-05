# Odin AI generations

Odin Pro subscribers receive 100 generations per UTC calendar month. The quota
is shared by Captions, Chapters and Silence Remover (which calls Captions).
Existing duration-based costs apply: one generation per started 10 minutes.
Section regeneration costs one. Combined Captions/Chapters uses the existing
signed receipt, bound to the namespaced Odin account ID, to avoid a second charge.
Free/expired accounts receive zero; there are no Odin extra-credit purchases.

The CEP panel sends its `odincep_` Bearer token to Motionflow AI endpoints.
`lib/odin-ai.ts` verifies it against the fixed Odin `/api/cep/me` endpoint on every
request. Request-body identity and Motionflow cookies cannot replace a revoked
Odin token. Subscription seats follow the Odin site's existing access rule.
Odin user IDs are namespaced strings and are never used as Motionflow DB IDs.

Usage lives in `odin_ai_generations`, keyed by Odin account and UTC month. A
transaction with a conditional increment enforces the cap across devices and
simultaneous calls. Provider failures before consumption do not charge usage.
The table is lazily created as in the existing generation service; deployments
without CREATE permission must first apply
`db/migrations/2026_10_05_odin_ai_generations.sql`.

Deploy this app's auth/metering/captions changes, then the Odin site's `/me`
entitlement change, then distribute the rebuilt Odin CEP panel. No new provider
credentials are required: the existing Motionflow AI providers are reused.
Odin caption catalogs use `Odin Pro Captions` in the existing public/private R2
buckets rather than falling back to another brand's catalog.

Local verification (no production calls or database access):

```sh
node scripts/test-odin-ai.mjs
npx tsc --noEmit --incremental false
```
