# Gal Toolkit — Demo pack versioning

Replaces AtomX `try_free` / daily re-download with first-party manifests on **motionflow.pro** + public R2.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/galtoolkit/demo?host=PR\|AE` | Latest demo manifest |
| `GET` | `/api/galtoolkit/demo/download?host=PR\|AE` | `302` to zip (or `?format=json` → `{ url, version }`) |

### Manifest shape

```json
{
  "version": "2026.08.06",
  "host": "PR",
  "downloadUrl": "https://cdn.motionflow.pro/public/downloads/galtoolkit/demo/PR/2026.08.06/pack.zip",
  "updatedAt": "2026-08-06T12:00:00.000Z"
}
```

CEP compares `version` to local `preferences.demoVersions[PR|AE]` and downloads only on mismatch (and only for users **without** active subscription).

## R2 layout (public bucket)

```
public/downloads/galtoolkit/demo/{PR|AE}/latest.json
public/downloads/galtoolkit/demo/{PR|AE}/{version}/pack.zip
```

## Fast ship without waiting for R2 upload

Set on Vercel / `.env`:

```
GALTOOLKIT_DEMO_PR_VERSION=2026.08.06
GALTOOLKIT_DEMO_PR_URL=https://cdn.motionflow.pro/.../pack.zip
GALTOOLKIT_DEMO_AE_VERSION=2026.08.06
GALTOOLKIT_DEMO_AE_URL=https://cdn.motionflow.pro/.../pack.zip
```

Env overrides R2 `latest.json`.

## Publish script

```bash
node scripts/publish-galtoolkit-demo.mjs --host PR --version 2026.08.06 --file ./demo-pr.zip
node scripts/publish-galtoolkit-demo.mjs --host AE --version 2026.08.06 --file ./demo-ae.zip
```

## CEP fallback

If the API returns empty `version` / network error:

- empty version → temporary once-per-day refresh (legacy)
- network error with local demo present → keep local
- download URL missing → AtomX `package?type=try_free` still used as last resort
