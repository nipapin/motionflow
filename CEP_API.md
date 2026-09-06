# CEP API — Packages market & downloads

For Adobe CEP / UXP panel developers integrating **author pack catalogs** (e.g. Spunkram).

**Base URL:** `https://motionflow.pro`  
**Auth:** `Authorization: Bearer <token>` on all market routes (`token` from device-code login).

Author identity is **never** sent by the panel. It is resolved server-side from the registered `client` (e.g. `spunkram-cep`).

---

## 1. Prerequisites — sign in

### 1.1 Start device login

`POST /api/cep/auth/device`

```json
{
  "client": "spunkram-cep",
  "device": { "mac": "…", "user": "…", "os": "…" }
}
```

Response:

```json
{
  "code": "ABCD-EFGH",
  "device_code": "<secret, panel-only>",
  "verification_url": "https://motionflow.pro/spunkram?code=ABCD-EFGH&client=spunkram-cep",
  "interval": 3,
  "expires_in": 300
}
```

Open `verification_url` in the system browser. Keep `device_code` only in the panel.

### 1.2 Poll for token

`POST /api/cep/auth/token`

```json
{ "code": "ABCD-EFGH", "device_code": "<secret>" }
```

When complete:

```json
{
  "status": "complete",
  "token": "mfcep_…",
  "user": { "id": "user_123", "email": "…", "name": "…" }
}
```

When the account is already at the **device limit** (default **3**, override with `CEP_DEVICE_LIMIT`):

```json
{
  "status": "device_limit",
  "device_limit": 3,
  "message": "Device limit reached. Revoke another device to continue signing in.",
  "devices": [
    {
      "id": "dev_123",
      "name": "optional label",
      "ip": "1.2.3.4",
      "user_fingerprint": "{…}",
      "last_seen_at": "2026-08-29T12:00:00.000Z"
    }
  ]
}
```

Browser confirm (`POST /api/cep/auth/confirm` approve) may return `{ "ok": true, "status": "device_limit" }` — the panel keeps polling and shows a picker; it does not receive a token yet.

### 1.2b Replace a device (finish login at limit)

`POST /api/cep/auth/replace-device`

```json
{
  "code": "ABCD-EFGH",
  "device_code": "<secret>",
  "revoke_device_id": "dev_123"
}
```

Revokes the chosen device (must belong to the pending session’s user), creates this panel’s device + Bearer, publishes `device.revoked` over Redis so the kicked socket is closed immediately, and returns the same shape as a successful token poll:

```json
{
  "status": "complete",
  "token": "mfcep_…",
  "user": { "id": "user_123", "email": "…", "name": "…" }
}
```

Same-MAC re-login still rotates the existing device token and does **not** consume an extra slot.

Store `token` securely. Use it as Bearer on every subsequent CEP call.

### 1.3 Session check (optional)

`GET /api/cep/me?host=AE|PR`  
Header: `Authorization: Bearer <token>`

Returns tier, subscription, entitlements, subscribe / manage URLs.  
`subscription.active` reflects the **author** (e.g. Spunkram) plan — not Motion Flow Creator platform alone.

---

## 2. List packages (market)

`GET /api/cep/market?host=AE|PR`

| Query | Values | Required |
|-------|--------|----------|
| `host` | `AE` (After Effects) or `PR` (Premiere). Default `AE` | Recommended |

**Headers**

```
Authorization: Bearer mfcep_…
```

Only packs that are **visible** in admin (`In CEP = On`), match `host`, and belong to the client’s author are returned.

### Response shape

```json
{
  "subscription_active": true,
  "subscribe_url": "https://motionflow.pro/pricing?client=spunkram-cep",
  "Packages": [
    {
      "id": "1",
      "name": "Wedding Pack",
      "pack_name": "wedding-pack",
      "author": "Spunkram",
      "version": "1.0.0",
      "primary_type": "PR",
      "image_url": "https://…/preview.jpg",
      "custom_price": 0,
      "owned": false,
      "covered_by_subscription": true,
      "action": "install",
      "install_url": "https://motionflow.pro/api/cep/market/download?pack_id=1",
      "buy_url": null,
      "details_url": "https://…",
      "min_extension_version": "1.0.0",
      "min_host_version": "24.0"
    }
  ]
}
```

### Field notes

| Field | Meaning |
|-------|---------|
| `id` | Pack id (string). Use as `pack_id` for download. |
| `pack_name` | Slug for local folder / cache keys. |
| `image_url` | Cover (16:9). Prefer this over any video field. |
| `custom_price` | `0` = free pack. |
| `action` | What the UI should do (see below). |
| `install_url` | Authenticated download entry when install is allowed. |
| `buy_url` | Open in browser when user must purchase / subscribe. |
| `details_url` | Optional marketing / pricing page. |
| `min_extension_version` | Oldest panel build that may install this pack. |
| `min_host_version` | Oldest Premiere / AE version supported. |

### `action` → UI

| `action` | Meaning | Panel behavior |
|----------|---------|----------------|
| `install` | User has author subscription (or equivalent entitlement). | Show **Install**. Call `install_url` with Bearer (see §3). |
| `get_free` | Pack price is free; no paid sub required. | Show **Get free** / Install. Same download flow as install. |
| `buy` | Paid pack, no active author subscription. | Show **Buy** / Subscribe. Open `buy_url` (or `subscribe_url` from the root payload). Do **not** call download. |

`subscription_active` on the root object mirrors author subscription for the signed-in user.

---

## 3. Download pack content (zip)

### Endpoint

`GET /api/cep/market/download?pack_id=<id>`

**Headers**

```
Authorization: Bearer mfcep_…
```

Prefer using the pack’s `install_url` from the market response (already includes `pack_id`).

### Success

**HTTP 302** redirect to the zip URL (public CDN or short-lived R2 presign).

Panel must:

1. Request with `Authorization: Bearer …`
2. **Follow redirects** (do not require Bearer on the final CDN/R2 host)
3. Save the body as the project zip

Example (Node / Electron-style):

```js
const res = await fetch(installUrl, {
  method: "GET",
  headers: { Authorization: `Bearer ${token}` },
  redirect: "follow",
});
if (!res.ok) throw new Error(`download failed ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
// write buf to disk / extract
```

### Errors (JSON, no redirect)

| Status | `error` | When |
|--------|---------|------|
| 401 | `UNAUTHORIZED` | Missing / invalid / revoked token |
| 400 | `MISSING_PARAMS` | `pack_id` missing or invalid |
| 404 | `NOT_FOUND` | Unknown pack, wrong author, or not visible in CEP |
| 403 | `NOT_OWNED` / related | Paid pack without subscription (or free entitlement) |
| 404 | `NO_DOWNLOAD` | Pack visible but zip not linked in admin |

Example:

```json
{
  "error": "NOT_OWNED",
  "message": "Purchase or Spunkram subscription required"
}
```

On `403` / buy-gated packs, send the user to `buy_url` or root `subscribe_url` from `/api/cep/market`.

---

## 3b. Incremental pack update (file diff)

### Endpoint

`POST /api/cep/market/diff`

**Headers**

```
Authorization: Bearer mfcep_…
Content-Type: application/json
```

**Body**

```json
{
  "pack_id": 123,
  "manifest": [
    { "name": "file.mogrt", "path": "Assets/…/file.mogrt", "size": 1234, "hash": "sha256…" }
  ]
}
```

`manifest` may also be smart_update form `{ "files": { "rel/path": { "size", "hash" } } }`.

### R2 layout

Author bucket root:

- `{stem}.zip` — full install (`download_key`)
- `{stem}/` — loose files + `{stem}/manifest.json` (same stem as the zip basename)

### Success

**HTTP 200** `application/zip` — only files whose hash differs from the client manifest, always including an updated `manifest.json`.

Headers:

| Header | Meaning |
|--------|---------|
| `X-Diff-Count` | Number of content files in the zip (excludes manifest) |
| `X-Delete-Count` | Paths in client manifest missing remotely (client should delete after extract) |
| `X-Pack-Stem` | Resolved R2 prefix stem |

Panel: extract over the installed pack folder, delete stale paths, keep the new `manifest.json`, bump prefs `version`.

### Errors (JSON)

| Status | `error` | When |
|--------|---------|------|
| 401 | `UNAUTHORIZED` | Missing / invalid token |
| 400 | `MISSING_PARAMS` | `pack_id` / `manifest` missing |
| 403 / 404 | same as full download | Entitlement / not found |
| 409 | `NO_DIFF_SOURCE` | No `{stem}/manifest.json` on R2 — fall back to full zip download |
| 404 | `NO_DOWNLOAD_KEY` / `NO_BUCKET` | Pack has no zip key or author bucket |

---

## 3c. Pack structure / categories (R2)

Browse the pack category tree **before** full install. Same R2 `{stem}/` layout as §3b.

### Endpoint

`GET /api/cep/market/structure?pack_id=<id>`

**Headers**

```
Authorization: Bearer mfcep_…
If-None-Match: "<etag>"   # optional — 304 when unchanged
```

**Visibility:** signed-in + pack visible for the device `client` (catalog scope). **Not** download-gate — sidebar works before Install.

### Algorithm

1. Resolve pack (author from `client`, visible / not admin-only unless admin).
2. Read `{stem}/manifest.json` (`stem` = basename of `download_key` without `.zip`).
3. Find first `*.spunkram` / `*.motionflow` path in the manifest.
4. `GetObject` that key; parse plaintext JSON (`settings` + `content`; legacy `structure` / `contents` normalized to `content`).

### Success `200`

```json
{
  "pack_id": "12",
  "pack_name": "gal-toolkit-max",
  "version": "1.4.0",
  "etag": "\"a1b2…\"",
  "settings": { "main": { "name": "…", "version": "…" } },
  "content": { "Transitions": { "Bokeh": { "preview": {} } } }
}
```

Headers: `ETag`, `Cache-Control: private, max-age=60`.

`304` when `If-None-Match` matches current etag (empty body).

### Errors (JSON)

| Status | `error` | When |
|--------|---------|------|
| 401 | `UNAUTHORIZED` | Missing / invalid token |
| 400 | `MISSING_PARAMS` | `pack_id` missing |
| 404 | `NOT_FOUND` | Unknown / wrong author / not visible |
| 404 | `NO_DOWNLOAD_KEY` / `NO_BUCKET` | No zip key or author bucket |
| 409 | `NO_STRUCTURE` | No `{stem}/manifest.json` or pack JSON on R2 |

Panel: `buildPackTree(content)` for sidebar / search; apply + previews still need local install (`Assets/` / `Previews/`).

---

## 3d. Gal Toolkit effects catalog (dedicated bucket)

Gal CEP browses Effects from private R2 bucket **`gal-toolkit-max`** (override with `R2_GAL_TOOLKIT_BUCKET`):

| Host | JSON key | Manifest | Assets prefix |
|------|----------|----------|---------------|
| `PR` (default) | `premiere-pro/Premiere Pro.json` | `premiere-pro/manifest.json` | `premiere-pro/Assets/` |
| `AE` | `after-effects/After Effects.json` | `after-effects/manifest.json` | `after-effects/Assets/` |

### Catalog

`GET /api/cep/gal/effects?host=PR|AE`

**Headers:** `Authorization: Bearer mfcep_…` (required). Optional `If-None-Match`.

**200**

```json
{
  "host": "PR",
  "pack_name": "Gal Toolkit MAX",
  "version": "1.4.0",
  "etag": "\"a1b2…\"",
  "settings": { "main": { "name": "…", "version": "…" } },
  "content": { "Transitions": { "…": { "preview": {} } } },
  "assets_base_url": "https://motionflow.pro/api/cep/gal/effects/media"
}
```

Panel: `buildPackTree(content)`; preview URLs = `{assets_base_url}/{segments}.{ext}` (see media route).

### Assets manifest (Bearer)

`GET /api/cep/gal/effects/assets-manifest?host=PR|AE`

Reads **`{hostPrefix}/manifest.json`** (e.g. `premiere-pro/manifest.json`). Same array / `{ files: { path: { hash } } }` shapes as Market pack manifests.

**Headers:** Bearer required. Optional `If-None-Match`.

**200**

```json
{
  "host": "PR",
  "etag": "\"…\"",
  "manifest": [{ "path": "Assets/_Assets/foo.mp4", "hash": "…" }]
}
```

CEP syncs only `_Assets` / `Assets/_Assets` entries on panel start; project files are downloaded on Apply.

### File download — presigned URL (Bearer)

`GET /api/cep/gal/effects/file?host=PR|AE&path={rel under hostPrefix}`

**Headers:** Bearer required. `path` examples: `Assets/Transitions/Bokeh/Bokeh.prproj`, `Assets/_Assets/…`.

**200**

```json
{
  "url": "https://…r2…presigned…",
  "key": "premiere-pro/Assets/Transitions/Bokeh/Bokeh.prproj",
  "path": "Assets/Transitions/Bokeh/Bokeh.prproj",
  "etag": "\"…\"",
  "size": 12345678,
  "expires_in": 600
}
```

CEP follows `url` **without** Authorization (strip auth on redirect). Compare `etag`/`size` to local `gal-file-index.json` and skip re-download when unchanged.

**Errors:** `401 UNAUTHORIZED`, `400 MISSING_PARAMS` / `BAD_PATH`, `404 NOT_FOUND`, `500 PRESIGN_FAILED`.

### Media proxy (private bucket)

`GET /api/cep/gal/effects/media/{…relative under Assets/}?host=PR|AE`

- **No Bearer** — `<img>` / `<video>` cannot send Authorization (same as showcase-media).
- Supports `Range` for video seek.
- Scoped to `{host}/Assets/` only; pack JSON and project downloads stay gated.

Public CDN bucket is **not** required while this proxy is used.

**Panel flow (Gal Apply without zip):**

```
1. GET /api/cep/gal/effects → tree + media base
2. GET /api/cep/gal/effects/assets-manifest → sync _Assets into install root
3. On Import: GET /api/cep/gal/effects/file?path=Assets/…/{group}.prproj
4. Stream to disk if etag changed → applyPackItemToHost
```

---

## 4. Recommended panel flow

```
1. Ensure Bearer token (device login if missing)
2. GET /api/cep/market?host=PR|AE
3. Render Packages[]
3b. Gal Effects: GET /api/cep/gal/effects?host=PR → sidebar + grid (Assets via media proxy)
3b2. Gal: GET /api/cep/gal/effects/assets-manifest → sync `_Assets`; on Apply GET …/file?path= → presign + disk
3c. Optionally GET /api/cep/market/structure?pack_id=… → sidebar categories before install
4. On Install / Get free:
     - Check min_extension_version / min_host_version locally
     - GET install_url with Bearer, follow redirects, save zip
5. On Update (installed version ≠ catalog, local manifest.json present):
     - POST /api/cep/market/diff with local manifest
     - On NO_DIFF_SOURCE → full zip download instead
6. On Buy:
     - shell.openExternal(buy_url || subscribe_url)
7. Optionally refresh GET /api/cep/me after returning from browser
```

---

## 5b. Client environment telemetry

`POST /api/cep/telemetry/session` — after CEP sign-in / session hydrate. Bearer required.

Records host app id/version (AEFT/PPRO), OS, and extension version into `cep_client_sessions` so we can see which Adobe versions still open the panel (e.g. CC2023).

Server dedupes identical user+device+host+os+extension within ~12 hours.

See CEP `docs/BACKEND_CEP_API.md` §6.0 and migration `db/migrations/2026_08_11_cep_client_sessions.sql`.

### Installed packs snapshot

`POST /api/cep/telemetry/installs` — full snapshot of packs currently on disk for this device. Bearer required.

Preferred body (with on-disk versions):

```json
{
  "packs": [
    { "pack_id": 12, "version": "1.2.0" },
    { "pack_id": 45, "version": "2.0.1" }
  ]
}
```

Legacy body still accepted: `{ "pack_ids": [12, 45, 90] }`.

- Replaces the previous snapshot for that `cep_devices` row (`cep_device_installs`, optional `version` column).
- Only pack ids belonging to the device client’s author (and not soft-deleted) are stored; others are rejected.
- Cap: 200 entries per request.
- Used by admin **Extensions Users** Packs modal → **Installed on disk**.

Migration: `db/migrations/2026_08_29_cep_device_installs.sql`.

### Active packs (in use)

`POST /api/cep/telemetry/active-packs` — packs currently open / focused in the host app. Bearer required.

```json
{ "pack_ids": [12] }
```

- Full snapshot per device (`cep_device_active_packs`); send `[]` when nothing is active.
- Cap: 50 ids. Same author-scoped allowlist as installs.
- Used by admin Packs modal → **Active now**.

Migration: `db/migrations/2026_08_29_cep_device_active_packs.sql`.

### Error reports

`POST /api/cep/support/report` — CEP error observer.

- Accepts registered CEP clients (e.g. `spunkram-cep`, `motionflow-davinci`).
- When `Authorization: Bearer mfcep_…` is present, the report is persisted to `cep_error_reports` (linked to `user_id` + `device_id`) for the Extensions Users admin list.
- Without Bearer: still accepted; Telegram for `severity: "error"` only; no DB row.
- `severity: "warning" | "info"`: accepted (and persisted if authenticated); Telegram is skipped.

Migration: `db/migrations/2026_08_29_cep_error_reports.sql`.

Admin UI: `/profile/extensions` (packages-admin emails) — users grouped by account; **Devices** modal (Revoke); **Packs** modal (purchased/entitled, installed, active).

---

## 5. Admin → CEP visibility (how packs appear)

Packs are managed in Motion Flow admin (`/profile/packages`). For a pack to show in `/api/cep/market`:

1. Author R2 bucket is set (Author settings on the author page)
2. Pack has **host** AE or PR matching the query
3. **Project source** (zip) is linked
4. Preview optional but recommended (`image_url`)
5. **In CEP** toggle is **On** (`visible`)

Hidden / soft-deleted packs are omitted from the market and return `NOT_FOUND` on download.

---

## 6. Clients

| `client` | Author | Extension label |
|----------|--------|-----------------|
| `spunkram-cep` | Spunkram (server registry) | Spunkram |
| `gal-cep` | Premiere Gal / Gal Toolkit MAX (`4141`) | Gal Toolkit MAX |
| `motionflow-davinci` | Motion Flow marketplace (`6`) | Motion Flow DaVinci |

Unknown `client` → `400 UNKNOWN_CLIENT` on device login.

Gal device login opens `https://premieregal.motionflow.pro/?code=…&client=gal-cep` (Allow / Deny on the storefront). Apex `/cep/login?client=gal-cep` redirects to `/premiere-gal`.

---

## 7. Motion Flow DaVinci script (`motionflow-davinci`)

Same device-login as Spunkram, different `client`:

```json
POST /api/cep/auth/device
{ "client": "motionflow-davinci", "device": { "mac": "…", "user": "…", "os": "…" } }
```

`verification_url` opens `https://motionflow.pro/cep/login?code=…&client=motionflow-davinci` (Allow / Deny).

`GET /api/cep/me` with this client returns **Motion Flow Creator** subscription (not Spunkram packs):

- `subscription.active` → can download marketplace templates
- `platform.generations` → Creator + AI quota
- `entitlements.creator_ai` / `marketplace_download`

These website APIs also accept the same `Authorization: Bearer mfcep_…` token:

| Goal | Method | Path |
|------|--------|------|
| Creator sub status | `GET` | `/api/me/subscription-status` |
| Can download item | `GET` | `/api/me/can-download?itemId=` |
| Download item zip | `GET` | `/api/download/{itemId}` |
| Favourites | `GET`/`POST` | `/api/favorites` |
| Generation quota | `GET` | `/api/me/generations` |
| Generation history | `GET` | `/api/me/generation-records` |
| My downloads | `GET` | `/api/me/downloads` |
| AI tools | `POST` | `/api/generations/*` |

---

## 8. Quick reference

| Goal | Method | Path |
|------|--------|------|
| Start login | `POST` | `/api/cep/auth/device` |
| Claim token | `POST` | `/api/cep/auth/token` |
| Replace device (at limit) | `POST` | `/api/cep/auth/replace-device` |
| Profile / entitlements | `GET` | `/api/cep/me` |
| List packs | `GET` | `/api/cep/market?host=AE\|PR` |
| Download zip | `GET` | `/api/cep/market/download?pack_id=` |
| Pack file diff | `POST` | `/api/cep/market/diff` |
| Telemetry installs | `POST` | `/api/cep/telemetry/installs` |
| Telemetry active packs | `POST` | `/api/cep/telemetry/active-packs` |

All market + download calls require **`Authorization: Bearer`**.
