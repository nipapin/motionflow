# CEP author permissions

`cep_author_permissions` is the authority for extension admin features and beta
updates for every author. It does not grant Motionflow website administrator access.
Runtime code has no email allowlist or `SPUNKRAM_BETA_EMAILS` fallback.

The server resolves the identity and author from the authenticated device token.
Motionflow ids and Odin account ids use separate `identity_provider` namespaces.
Odin tokens are validated by the Odin account service before any grant is read.
The panel cannot select an author, identity or permission with request parameters.

| Author | `author_id` |
| --- | --- |
| Motionflow | 6 |
| Spunkram | 1691 |
| Premiere Gal | 4141 |
| Odin | 900000001 |

An active `admin` grant enables extension admin tools and beta updates. A separate
`beta_updates` grant enables beta updates without admin tools. Missing or revoked
grants deny access. An unmigrated database also denies all elevated access.

Apply before deploying the new API, then distribute updated CEP builds:

```powershell
node --env-file=.env --env-file=.env.local scripts/apply-cep-author-permissions-migration.mjs
```

If `ODIN_MANAGEMENT_ORIGIN` points to a deployment-only loopback service, run the
import on that host or override its origin with the trusted public Odin endpoint:

```powershell
node --env-file=.env --env-file=.env.local --input-type=module -e "process.env.ODIN_MANAGEMENT_ORIGIN = 'https://odin-pro.com'; await import('./scripts/apply-cep-author-permissions-migration.mjs');"
```

The SQL seeds existing Motionflow accounts from the former three-email list for
current authors. The runner also imports the legacy environment list and resolves
existing Odin accounts through the configured management service. It never creates
accounts or turns a Motionflow id into an Odin id. Re-running preserves revoked
rows; it does not restore revoked grants. Remove the legacy environment variable
after migrating. Use a backup before removing grant rows: re-running the initial
migration can insert deleted seed grants, so revoke with `revoked_at` instead.

Grant one identity access to one author from a trusted database session, for example
the previously requested Motionflow user 266 at Spunkram:

```sql
INSERT INTO cep_author_permissions (author_id, identity_provider, subject_id, permission)
VALUES (1691, 'motionflow', '266', 'admin')
ON DUPLICATE KEY UPDATE revoked_at = NULL;

UPDATE cep_author_permissions SET revoked_at = CURRENT_TIMESTAMP
WHERE author_id = 1691 AND identity_provider = 'motionflow'
  AND subject_id = '266' AND permission = 'admin';
```

For Odin use `identity_provider = 'odin'` and its verified account id, without the
`odin:` prefix. Future authors use their own author id and explicit grants.

`GET /api/cep/me` includes `permissions: { admin, beta_updates }` for Motionflow
sessions. `GET /api/cep/permissions` provides the same flags for all device tokens,
including Odin; its `client` is resolved from the token. Responses are not cached.
The panel keeps flags only in memory, tied to the current token, and denies admin
access until a successful server response. Switching accounts, signing out or a
failed profile refresh cannot retain another session's grants.

Every `/api/cep/update/versions` and `/api/cep/update` request reads current DB
permissions. Invalid device tokens cannot fall back to a browser cookie. Local UI
changes can reveal local controls, but cannot grant access to protected server APIs.
