# Account change history

`user_account_audit` retains account creation, changes and deletion. MySQL triggers on
`users` capture writes from Next.js, Laravel and direct SQL. An entry contains the
account ID, actor ID when known, source, UTC time and the changed fields with their
before/after values. No-op updates, `updated_at` and `remember_token` are ignored.
Password and payout-account changes contain only `{ "changed": true }`; password
hashes, payout credentials and Google IDs are never copied into history. Google
linking is represented as a boolean. There is no retrospective history backfill.

## Installation

Run from the repository root with the same database environment as the site:

```powershell
node --env-file=.env scripts/apply-account-audit-migration.mjs
```

The additive migration creates one InnoDB table and three triggers. The runner
leaves existing triggers in place, checks that their bodies match, and can be
re-run. The database user needs CREATE and TRIGGER permissions. No existing
account records are changed. Deploy the application code to enable the History
tab and actor/source annotations. The triggers capture changes even before that
deployment, with `database` as source and no actor ID.

## Actor and transaction handling

`withAccountAudit` sets actor/source session variables on a checked-out connection,
runs the mutation on that same connection and clears the variables before release.
If cleanup fails it destroys the connection to prevent leaking the previous actor.
The helper does not start a transaction; callers retain their existing transaction
boundaries. InnoDB triggers write history in the account mutation's transaction,
so a rollback also removes its audit entry.

Authenticated profile edits, password resets, email verification, Google linking,
admin profile edits/deletion and admin credit changes annotate their source.
New registration and Google signup have no pre-existing actor ID. Legacy code,
background processing and direct SQL retain the default `database` source with
an unknown actor; the log does not infer a human actor from a shared SQL login.

## Reading history

The admin user card has a History tab with refresh and cursor pagination (50
entries per page). `/api/admin/users/{id}/history` uses the same administrator
authorization as the Users API and disables response caching. `?cursor={auditId}`
loads older entries. Audit IDs are strings to preserve the unsigned BIGINT range.
History has no foreign keys or account-deletion cleanup, so it remains accessible
through this endpoint by account ID after deletion. The deleted account is no
longer present in the current Users list.

## Verification

```powershell
node --test scripts/test-account-audit.mjs scripts/test-admin-user-deletion.mjs
node --env-file=.env scripts/test-account-audit-db.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The database integration test creates uniquely named disposable copies of the
users/audit tables and drops only those copies afterward. It never changes real
accounts. It checks credential redaction, case-only and null changes, no-op writes,
transaction rollbacks and retention after deletion.
