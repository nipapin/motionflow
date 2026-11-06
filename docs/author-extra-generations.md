# Manual author extra-generation grants

In Authors → author → Users → Manage, the Extra generations section loads the selected user's balance for that author. Enter a positive integer and optionally an internal note, then click **Add generations**. This is a separate action from **Save access**: it does not change Paddle subscriptions, grant packs, or create a payment. For a new email, create the account through the existing access form first.

The section supports the local author-credit scopes used by Spunkram and Premiere Gal. It is hidden for unsupported authors, platform clients and Odin's separate backend ledger.

`GET/POST /api/extensions/{authorId}/users/{userId}/generation-credits` requires the same website session and packages-admin permission as the existing author access API. POST accepts `{ amount, requestId, note? }`; requestId is a UUID v4. Amount is additive (1–1,000,000), not an absolute replacement. Retries of an identical request do not grant twice. Reusing an ID with a different amount or administrator is rejected.

Grants write to `user_generation_credits` keyed by `(user_id, author_id)`. Spunkram uses `author_id=1691`; MotionFlow uses `0` and is untouched by this action. The existing `/api/cep/generations` reads this same author scope when authenticated by the extension's CEP Bearer token. Refresh/reopen the extension's balance to fetch the updated value.

The credit row is locked during the transaction. Balance increment and an `admin_add_extra` entry in `user_generation_credit_audit` commit together. The audit payload contains request ID, administrator ID, amount and before/after balances; an optional note is saved alongside. Failed audit writes roll back the grant. No tokens, email addresses or SQL errors are written to request logs.

No additional schema migration or environment secret is required beyond the existing author-scoped credit/audit tables. Deploy the new service, API route, component and its integration in `extensions-give-access-dialog.tsx` together.

Verification: `node --test scripts/test-author-generation-credits.mjs`. Tests use in-memory balances and synthetic identities, with no writes to real accounts.

## Bulk grants

Authors → author → Users → **Add generations** applies the current search, user
filters and column filters across all pages. Optional purchased-pack checkboxes
restrict recipients to buyers of any selected paid pack. Owning several selected
packs still yields one grant. A subscription or a free pack alone does not match
that purchase restriction. With no packs selected, only the current user filters
are applied.

**Preview recipients** freezes up to 10,000 distinct user IDs and shows the amount
per user and total. The administrator must then click the button naming the exact
amount and recipient count. The server processes 25 recipients per request using
the existing audited, transactional author-credit service. Each recipient reuses
the batch UUID as its grant request ID, so retries cannot grant twice.

Redis stores draft previews for one hour and started operations for seven days.
The same administrator can resume an interrupted operation using the saved ID in
the same browser. Keep the form open while it runs; the browser drives subsequent
batches. Other authors' balances and platform credits are untouched. Failed or
expired operations should be reconciled against the credit audit before creating
a new grant. This is an additive action, never an absolute balance replacement.

## November 2026 Spunkram bonus

`scripts/grant-spunkram-pack-bonus.mjs` is a manually invoked one-off operation,
not a deployment hook. Confirm the catalog pack IDs, then preview on the active
production release:

```sh
node --env-file=.env scripts/grant-spunkram-pack-bonus.mjs --pack-ids=3,8
```

Append `--apply --admin-user-id=<authorized packages administrator>` to grant.
It adds 10 to author 1691's extra balance per distinct eligible buyer, with one
transaction covering all increments and audit records. The fixed operation UUID
prevents repeats, including when both AE and PR packs are owned. Existing credits
are preserved; no payment, subscription or pack access is created or changed.
