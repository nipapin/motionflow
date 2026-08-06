# Packages Admin — MVP A (done)

Shipped for superadmin `basepackagehelp@gmail.com` (+ env `PACKAGES_ADMIN_EMAILS`).

## Web

- Nav item **Packages** → `/profile/packages`
- Authors: Premiere Gal (4141), Spunkram (1691)
- Premiere Gal: Demo PR/AE — edit name/description/version, copy CDN link, upload zip, list versions on R2
- Both authors: R2 object listing under prefixes + recent R2Sync events

## APIs

### Studio (session + packages admin)

- `GET /api/studio/packages/authors`
- `GET /api/studio/packages?author=`
- `GET /api/studio/packages/r2?author=&prefix=`
- `GET|PATCH /api/studio/packages/demo`
- `POST /api/studio/packages/demo/presign`
- `POST /api/studio/packages/demo/publish`

### R2Sync (shared secret, no login)

See [r2sync-api.md](./r2sync-api.md).

## R2 / libs

- `lib/packages-admin.ts` — allowlist + author registry
- `lib/galtoolkit-demo.ts` — manifest `name`/`description`, list versions, pointer publish
- `lib/r2-list.ts` — ListObjects helpers
- `lib/r2sync-events.ts` — MySQL `r2sync_events` (lazy create)

## Env

```
PACKAGES_ADMIN_EMAILS=basepackagehelp@gmail.com
R2SYNC_ADMIN_SECRET=...   # required in production for /api/r2sync/*
GALTOOLKIT_DEMO_PR_VERSION / _URL / _NAME / _DESCRIPTION  # optional overrides
GALTOOLKIT_DEMO_AE_*
```

## Not in A (see Phase B)

Full `marketplace_items` CRUD in MySQL, paid pack secure R2 publish from UI, author web access, Spunkram ZXP upload from web.
