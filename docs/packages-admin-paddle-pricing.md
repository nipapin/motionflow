# Packages Admin — Paddle pricing plan

Build on current Packages UI (`/profile/packages/{authorId}/{itemId}`) and existing Paddle server wrapper (`lib/paddle-api.ts`).

## Goal

From Packages admin, configure a marketplace project as a sellable product:

1. Open project → see linked Paddle product / prices (if any)
2. If new → create Product + Price(s) on Paddle from the form
3. Persist IDs on the marketplace row → checkout-ready

**Assumption (locked):** one Paddle account for all authors/prices. Server key: `PADDLE_API_KEY` (not client token). Environment follows `NEXT_PUBLIC_PADDLE_ENVIRONMENT` (`sandbox` | `production`).

> Do **not** use `PADDLE_DEV_API_KEY` — current code only reads `PADDLE_API_KEY`.  
> Key must be a full Billing API key (`pdl_sdbx_apikey_…` / `pdl_live_apikey_…`), from Dashboard → Developer tools → Authentication, with `product.read` + `product.write`.

## Current state

| Piece | Status |
|-------|--------|
| Packages project CRUD (meta, preview, zip) | Done |
| Soft-delete + full-width admin list | Done |
| Marketplace checkout via `json_args.paddle_price_ids` | Exists (Spunkram pattern) |
| `PADDLE_API_KEY` + `paddleFetch` | Exists |
| `getPrice(priceId)` | Exists |
| List/create product & price helpers | Missing |
| Packages DTO exposes `price` / `json_args` / Paddle ids | Missing |
| Editor UI for Paddle | Missing |

Canonical storage (reuse Spunkram):

```json
{ "paddle_price_ids": ["pri_personal", "pri_commercial"] }
```

Also store `paddle_product_id` (`pro_…`) in `json_args` for idempotent re-open:

```json
{
  "paddle_product_id": "pro_…",
  "paddle_price_ids": ["pri_…"]
}
```

Mirror display amount into `marketplace_items.price` when saving (USD major units), so list/earnings stay consistent.

## UX (project editor)

New card: **Paddle pricing**

- Show linked `pro_…` + each `pri_…` (amount, currency, one-time vs recurring, status)
- Actions:
  - **Refresh from Paddle** — GET product/prices by stored ids
  - **Create on Paddle** — only if no `paddle_product_id` (or product archived)
  - **Add price** — one-time and/or personal/commercial presets
  - **Save links** — write `json_args` + `price` without calling Paddle
  - Optional later: archive price, replace price (new `pri_` + update `json_args`)

Form fields for create:

- Product name (default: project name)
- `tax_category` (default: `standard` or agreed SaaS category)
- Price amount (USD) + type: `one_time` | `recurring` (interval month/year)
- Optional second license price (commercial)

## API (packages-admin only)

All routes: session + `isPackagesAdmin`. Single Paddle account via `PADDLE_API_KEY`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/packages/[authorId]/projects/[itemId]/paddle` | Resolve linked product/prices from Paddle |
| `POST` | `/api/packages/[authorId]/projects/[itemId]/paddle` | Create product (+ initial price) and bind to item |
| `POST` | `/api/packages/[authorId]/projects/[itemId]/paddle/prices` | Add another price to existing product |
| `PATCH` | `/api/packages/[authorId]/projects/[itemId]` | Extend patch: `json_args`, `price`, `access` |

Idempotency:

- Before create: if `json_args.paddle_product_id` set → refuse duplicate create (return existing)
- Set Paddle `custom_data`: `{ marketplace_item_id, author_id }`
- Use `Paddle-Idempotency-Key` on create (`packages-item-{itemId}-product`, `…-price-{kind}`)

## Lib work

1. **`lib/paddle-api.ts`**
   - `listProducts`, `getProduct`, `createProduct`
   - `listPrices` (filter `product_id`), `createPrice`
   - Types for product/price entities (id, name, unit_price, billing_cycle, status)

2. **`lib/packages-projects.ts`**
   - DTO: `price`, `json_args` (or parsed `paddle: { productId, priceIds }`)
   - Patch: `price`, `json_args` / structured paddle bind helper
   - Helper: parse/write `paddle_price_ids` + `paddle_product_id` safely

3. **`components/packages-project-editor.tsx`**
   - Paddle card UI wired to the new routes

## Env checklist

```env
PADDLE_API_KEY=pdl_sdbx_apikey_…   # or pdl_live_…
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox   # must match key env
```

Vercel: same vars for preview/prod as appropriate. Never commit keys.

## Rollout phases

### Phase P0 — Read + bind (smallest useful)

- Extend DTO + PATCH for `json_args` / `price`
- GET paddle status for item
- UI: paste/show `pro_` / `pri_` + refresh from API
- Manual create still in Paddle dashboard OK

### Phase P1 — Create from admin

- `createProduct` + `createPrice` from editor
- Persist ids + update `marketplace_items.price`
- One-time USD price first (Gal Toolkit–style packs)

### Phase P2 — Multi-price + publish

- Personal + commercial prices
- Recurring optional
- Toggle `access` (Pending → Active) when pricing ready
- List column: Paddle linked / missing

## Out of scope (this plan)

- Separate Paddle accounts per author (explicitly not needed)
- Changing amount on an existing `pri_` in place (prefer new price + rebind)
- Hard-delete of Paddle entities (archive only, later)
- Full storefront redesign
- CEP market download changes

## Acceptance

- [ ] Admin opens existing project with `json_args.paddle_price_ids` → sees live Paddle amounts
- [ ] New project: Create on Paddle → row has `pro_` + `pri_` in `json_args`, `price` set
- [ ] Refresh does not create duplicates
- [ ] Wrong/missing `PADDLE_API_KEY` → clear 503/error in UI, no silent fail
- [ ] Sandbox key only talks to sandbox-api; live key to api.paddle.com

## References

- [Create products & prices](https://developer.paddle.com/build/products/create-products-prices)
- [Products API](https://developer.paddle.com/api-reference/products)
- [Prices API](https://developer.paddle.com/api-reference/prices)
- Existing parse pattern: `lib/spunkram-paddle-config.ts` (`paddle_price_ids`)
- Packages editor: `components/packages-project-editor.tsx`
