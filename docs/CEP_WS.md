# CEP WebSocket + session security

## Connect

`wss://motionflow.pro/api/cep/ws` (requires custom `node server.mjs`, not plain `next start`).

1. Open socket (no token in URL).
2. Send `{ "type": "auth", "token": "mfcep_…" }`.
3. On `{ "type": "auth.ok" }` send `{ "type": "hello", "host": "AE"|"PR" }`.
4. Receive pack events for that author + host.

Invalid/revoked token → close `4401`.

## Presence (Online / Offline)

On successful `auth.ok`, the hub sets Redis `cep:presence:dev:{deviceId}` with TTL **90s** and refreshes it on client `ping` / hub heartbeat. On socket close the key is deleted.

Admin Extensions Users reads these keys → `online` / `online_count` on device DTOs.

## Events (Redis `cep:events:{authorId}`)

| type | When |
|------|------|
| `pack.created` | CEP visibility 0→1 |
| `pack.updated` | Visible pack metadata/zip change |
| `pack.deleted` | Soft-delete or visibility 1→0 |

Payload: `{ type, id, name, pack_name, host, version?, image_url?, visible?, ts, author_id }` — no signed URLs.

## Extension releases (Redis `cep:extension`)

Published after R2 upload via `POST /api/cep/update/notify` (CEP Bearer of a signed-in user) or in-process from `publishSpunkramZxp` (GitHub webhook). Hub broadcasts to **authenticated** CEP sockets only.

```json
{
  "type": "extension.update",
  "version": "0.5.1",
  "zxp_url": "https://cdn.motionflow.pro/public/downloads/spunkram/0.5.1/spunkram.zxp",
  "changelog": "…",
  "channel": "stable",
  "published_at": "2026-08-08T02:00:00.000Z",
  "ts": 1710000000000
}
```

Panel re-checks `GET /api/cep/update` (Bearer required; beta allowlist → `beta.json`) before showing the Update banner.

## Device revoke (Redis `cep:device`)

Published from `revokeDevice`, admin revoke, and `POST /api/cep/auth/replace-device`:

```json
{
  "type": "device.revoked",
  "user_id": 6,
  "device_id": 123,
  "ts": 1710000000000
}
```

Hub matches open sockets for that `device_id`, sends:

```json
{ "type": "device.revoked", "device_id": "dev_123", "ts": … }
```

then closes with code **`4401`** / reason **`REVOKED`**. Panel must clear the session vault entry and show login immediately (do not wait for the next `/me`).

## Session

All CEP HTTP + WS use the same opaque Bearer `mfcep_…` (DB-hashed, revocable). Stock search/download require auth + rate limit.

Device limit default is **3** (`CEP_DEVICE_LIMIT`). At limit, token poll returns `device_limit` + devices; panel calls `POST /api/cep/auth/replace-device`.
