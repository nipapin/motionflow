# R2Sync API

Desktop superadmin sync app ↔ Motionflow R2. **No user login.** Protect with shared secret.

## Auth

Header (either):

- `x-r2sync-secret: <R2SYNC_ADMIN_SECRET>`
- `Authorization: Bearer <R2SYNC_ADMIN_SECRET>`

In production `R2SYNC_ADMIN_SECRET` must be set. In development, missing secret is allowed.

Author is always passed as `author=premiere-gal|spunkram` (query or JSON body).

## Endpoints

| Method | Path | Body / query | Notes |
|--------|------|--------------|-------|
| GET | `/api/r2sync/authors` | — | Registry |
| GET | `/api/r2sync/files?author=&prefix=` | | List R2 under author prefixes |
| POST | `/api/r2sync/presign` | `{ author, key, contentType? }` | Presigned PUT; key must be under author prefix |
| POST | `/api/r2sync/complete` | `{ author, key, action?, meta? }` | Record sync event |
| POST | `/api/r2sync/demo/publish` | `{ host: PR\|AE, version, name?, description? }` | Refresh Gal demo `latest.json` |
| GET | `/api/r2sync/events?author=&limit=` | | Recent events |

## Typical upload flow

1. `POST /presign` → `{ putUrl, publicUrl, key }`
2. `PUT putUrl` with file bytes
3. `POST /complete` (optional audit)
4. For Gal demo: `POST /demo/publish` after zip at `public/downloads/galtoolkit/demo/{host}/{version}/pack.zip`

## Web admin

Session user `basepackagehelp@gmail.com` → `/profile/packages` (Studio APIs under `/api/studio/packages/*`).
