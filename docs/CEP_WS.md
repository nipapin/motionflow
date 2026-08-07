# CEP WebSocket + session security

## Connect

`wss://motionflow.pro/api/cep/ws` (requires custom `node server.mjs`, not plain `next start`).

1. Open socket (no token in URL).
2. Send `{ "type": "auth", "token": "mfcep_…" }`.
3. On `{ "type": "auth.ok" }` send `{ "type": "hello", "host": "AE"|"PR" }`.
4. Receive pack events for that author + host.

Invalid/revoked token → close `4401`.

## Events (Redis `cep:events:{authorId}`)

| type | When |
|------|------|
| `pack.created` | CEP visibility 0→1 |
| `pack.updated` | Visible pack metadata/zip change |
| `pack.deleted` | Soft-delete or visibility 1→0 |

Payload: `{ type, id, name, pack_name, host, version?, image_url?, visible?, ts, author_id }` — no signed URLs.

## Session

All CEP HTTP + WS use the same opaque Bearer `mfcep_…` (DB-hashed, revocable). Stock search/download require auth + rate limit.
