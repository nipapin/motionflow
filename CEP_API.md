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

## 4. Recommended panel flow

```
1. Ensure Bearer token (device login if missing)
2. GET /api/cep/market?host=PR|AE
3. Render Packages[]
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

Unknown `client` → `400 UNKNOWN_CLIENT` on device login.

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
| Profile / entitlements | `GET` | `/api/cep/me` |
| List packs | `GET` | `/api/cep/market?host=AE\|PR` |
| Download zip | `GET` | `/api/cep/market/download?pack_id=` |
| Pack file diff | `POST` | `/api/cep/market/diff` |

All market + download calls require **`Authorization: Bearer`**.
