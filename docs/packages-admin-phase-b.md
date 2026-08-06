# Packages Admin — Phase B plan

Build on MVP A ([packages-admin-mvp-a.md](./packages-admin-mvp-a.md)).

## Goal

Full pack management for marketplace items (not only Gal Demo / public downloads):

- Edit `marketplace_items` name, description, tags, price, files in MySQL scoped by `author_id`
- Bind private R2 `secure/market/items/{itemId}/{main}.zip`
- Upload/replace main zip from Studio UI and R2Sync
- Persist pack `version` (new column or `json_args` / side manifest)
- Expose version + R2 install URLs on `GET /api/cep/market`
- Align with «Отречение» (retire AtomX `mau` / Laravel download for CEP)

## Suggested workstreams

1. **Schema** — `version` (VARCHAR) on marketplace items; optional `r2_key` / keep deriving from `files.main`
2. **Studio UI** — per-author item list → edit form → publish zip to private bucket
3. **Studio API** — CRUD + private-bucket presign (`R2_BUCKET`) reusing `marketplace-r2-presign.ts`
4. **R2Sync** — `POST /api/r2sync/market/publish` with `itemId` + version after PUT
5. **CEP** — market DTO includes `version`, `install_url` → R2 presign gate
6. **Migration** — inventory AtomX-only packs; sync to R2; cutover checklist in `operaciya-otrechenie.md`

## Auth (unchanged from A for web)

Web still packages-admin email allowlist. Optional later: authors with `access >= 2` see only their `author_id`.

## Out of scope for B

- Full Laravel authors.motionflow.pro replacement
- Encrypted BIN_AX packs (plaintext R2 only, per Отречение)
