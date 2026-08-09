# Gal Toolkit — Demo pack versioning

CEP fetches free demo packs from **motionflow.pro**. Source of truth is the **admin Packages project** for Premiere Gal (`author_id = 4141`): a visible free pack (`price = 0`) with `download_key` bound for host `PR` or `AE`.

Legacy env / R2 `latest.json` remain as fallbacks.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/galtoolkit/demo?host=PR\|AE` | Latest demo manifest (`version` + `downloadUrl`) |
| `GET` | `/api/galtoolkit/demo/download?host=PR\|AE` | `302` to project zip (CDN or R2 presign). `?format=json` → `{ url, version, projectId }` |

### Manifest shape

```json
{
  "version": "2026.08.06",
  "host": "PR",
  "downloadUrl": "https://motionflow.pro/api/galtoolkit/demo/download?host=PR",
  "updatedAt": "2026-08-06T12:00:00.000Z",
  "name": "Gal Toolkit Demo (PR)",
  "projectId": 12
}
```

- Public `download_key` (`public/…`) → `downloadUrl` may be the CDN zip directly.
- Private / secure keys → `downloadUrl` is the download gate above (fresh presign on each request).

CEP compares `version` to local `preferences.demoVersions[PR|AE]` and downloads only on mismatch (and only for users **without** active subscription).

## Admin setup

1. Create a project for Premiere Gal, host `PR` / `AE`
2. Set **price = 0** (free pack) and **visible**
3. Bind / upload the zip (`download_key`)
4. Set `version` (CEP uses this for update checks)

## Resolve order

1. `packages_projects` — visible, `price <= 0`, matching host, with `download_key`
2. Env override (`GALTOOLKIT_DEMO_{PR|AE}_VERSION` + `_URL`)
3. R2 `public/downloads/galtoolkit/demo/{host}/latest.json`

## Legacy R2 layout (fallback only)

```
public/downloads/galtoolkit/demo/{PR|AE}/latest.json
public/downloads/galtoolkit/demo/{PR|AE}/{version}/pack.zip
```

## CEP fallback

If the API returns empty `version` / network error:

- empty version → temporary once-per-day refresh (legacy)
- network error with local demo present → keep local
- download URL missing → AtomX `package?type=try_free` still used as last resort
