# Manual author extra-generation grants

In Authors → author → Users → Manage, the Extra generations section loads the selected user's balance for that author. Enter a positive integer and optionally an internal note, then click **Add generations**. This is a separate action from **Save access**: it does not change Paddle subscriptions, grant packs, or create a payment. For a new email, create the account through the existing access form first.

The section supports the local author-credit scopes used by Spunkram and Premiere Gal. It is hidden for unsupported authors, platform clients and Odin's separate backend ledger.

`GET/POST /api/extensions/{authorId}/users/{userId}/generation-credits` requires the same website session and packages-admin permission as the existing author access API. POST accepts `{ amount, requestId, note? }`; requestId is a UUID v4. Amount is additive (1–1,000,000), not an absolute replacement. Retries of an identical request do not grant twice. Reusing an ID with a different amount or administrator is rejected.

Grants write to `user_generation_credits` keyed by `(user_id, author_id)`. Spunkram uses `author_id=1691`; MotionFlow uses `0` and is untouched by this action. The existing `/api/cep/generations` reads this same author scope when authenticated by the extension's CEP Bearer token. Refresh/reopen the extension's balance to fetch the updated value.

The credit row is locked during the transaction. Balance increment and an `admin_add_extra` entry in `user_generation_credit_audit` commit together. The audit payload contains request ID, administrator ID, amount and before/after balances; an optional note is saved alongside. Failed audit writes roll back the grant. No tokens, email addresses or SQL errors are written to request logs.

No additional schema migration or environment secret is required beyond the existing author-scoped credit/audit tables. Deploy the new service, API route, component and its integration in `extensions-give-access-dialog.tsx` together.

Verification: `node --test scripts/test-author-generation-credits.mjs`. Tests use in-memory balances and synthetic identities, with no writes to real accounts.
