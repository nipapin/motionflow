# Admin / contributor UI migration (Laravel → Next.js)

This document tracks porting the **7 contributor tabs** from `aniomLaravelSite` into this Next.js app. **The MySQL schema is unchanged** — only the UI and read/write paths moved.

## Progress overview

| Phase | Scope | Status |
|------|--------|--------|
| 0 | Foundation: `proxy.ts`, `SessionUser.access`, route groups, sidebar | **Done** |
| 1 | `/profile/dashboard` | **Done** |
| 2 | `/profile/items` | **Done** |
| 3 | `/profile/earnings/*` | **Done** (subscription tab admin-only, matches Laravel) |
| 4 | `/profile/payouts` + setup + invoice | **Done** |
| 5 | `/profile/affiliate` + create/edit + API | **Done** |
| 6 | `/profile/marketing/*` | **Done** (coupons create, search queries, notifications list) |
| 7 | `/profile/upload` + draft + presign | **Done (MVP)** — `POST /api/profile/upload/draft` + `POST /api/profile/upload/sign` (presigned PUT to `preview/{itemId}/…`, same R2 layout as Laravel). Full Laravel parity (chunked temp, Editor.js, attribute blocks) still optional hardening. |

## URL map (Next.js)

| Legacy Laravel | Next.js |
|----------------|---------|
| `/dashboard` | `/profile/dashboard` |
| `/upload`, `/upload/{category}` | `/profile/upload`, `/profile/upload/{category}` |
| `/my_items`, `/my_items/team` | `/profile/items`, `/profile/items?team=1` |
| `/affiliate` | `/profile/affiliate` |
| `/marketing/...` | `/profile/marketing/{section}` |
| `/earnings/{sales\|subscription\|subscribers}` | `/profile/earnings/{section}` |
| `/payouts` | `/profile/payouts` |

## Key files

- **Auth / RBAC:** [`lib/auth/access-control.ts`](lib/auth/access-control.ts), [`lib/auth/get-session-user.ts`](lib/auth/get-session-user.ts), [`proxy.ts`](proxy.ts)
- **Partner shell (access ≥ 1):** [`app/(profile)/profile/(partner)/layout.tsx`](app/(profile)/profile/(partner)/layout.tsx)
- **Author shell (access ≥ 2):** [`app/(profile)/profile/(creator)/layout.tsx`](app/(profile)/profile/(creator)/layout.tsx)
- **Domain queries:** [`lib/author/*.ts`](lib/author/)
- **API:** [`app/api/profile/payouts/setup/route.ts`](app/api/profile/payouts/setup/route.ts), [`app/api/profile/affiliate/`](app/api/profile/affiliate/), [`app/api/profile/marketing/coupons/route.ts`](app/api/profile/marketing/coupons/route.ts), [`app/api/profile/upload/draft/route.ts`](app/api/profile/upload/draft/route.ts), [`app/api/profile/upload/sign/route.ts`](app/api/profile/upload/sign/route.ts)

## Laravel references (source of truth)

| Feature | Laravel |
|---------|---------|
| Dashboard | `App\Http\Controllers\Contributor\Dashboard`, `resources/views/market/contributor/dashboard.blade.php` |
| Items | `Contributor\Items`, `MarketplaceItem::getContributorItems` |
| Earnings | `Contributor\Earnings`, `SoldItems`, `SubscriptionDownloads`, `SubscriptionSystem` |
| Payouts | `Contributor\Payouts`, `App\Models\Payouts` |
| Affiliate | `Contributor\Affiliate`, `ShortLinks` |
| Marketing | `Contributor\Marketing`, `coupon_services`, `search_query_stats`, `mailing_updates_notifies` |
| Upload | `Contributor\ItemManager`, `Contributor::ajaxUploading` |

## Changelog

- **2026-05-04** — Phases 0–7 MVP in repo (`/api/profile/upload/draft`, `/api/profile/upload/sign`). Upload presign uses Laravel-aligned R2 keys `preview/{itemId}/…` (`itemId` + author ownership check). Document created.

## Definition of done (per phase)

- [x] Uses design tokens + `components/ui/*`
- [x] RBAC: partner vs author vs admin (earnings subscription = admin only)
- [x] Draft row + presigned PUT entrypoint (`/api/profile/upload/sign`)
- [ ] Full Laravel upload parity (chunked temp, Editor.js, per-category attribute blocks, price block) — **optional / later**
