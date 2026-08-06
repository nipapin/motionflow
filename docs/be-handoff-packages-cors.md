# BE handoff: Packages admin — page not opening + CORS

Контекст: суперадмин UI `/profile/packages` (MVP A) и API Studio / R2Sync.  
Симптомы: страница Packages «не открывается», в консоли CORS.

Этот документ — аудит для BE (без правок в коде). Frontend/infra могут чинить параллельно.

---

## Что есть в проде (релевантные пути)

| Зона | Путь |
|------|------|
| UI | `/profile/packages` → `app/(main)/(profile)/profile/packages/page.tsx` |
| Studio API (session cookie) | `/api/studio/packages/*` |
| R2Sync API (shared secret) | `/api/r2sync/*` |
| Allowlist | `lib/packages-admin.ts` → `basepackagehelp@gmail.com` + env `PACKAGES_ADMIN_EMAILS` |
| Demo R2 | `public/downloads/galtoolkit/demo/{PR\|AE}/…` |
| Docs | `docs/packages-admin-mvp-a.md`, `docs/r2sync-api.md` |

---

## Симптом A — Packages «не открывается»

Чаще всего это **не 500**, а **redirect**.

### A1. Allowlist email (высокий приоритет)

В `profile/packages/page.tsx`:

- нет сессии → `redirect("/")`
- email не в allowlist → `redirect("/profile")`

Allowlist по умолчанию только:

```txt
basepackagehelp@gmail.com
```

Расширение: env `PACKAGES_ADMIN_EMAILS` (comma-separated).

**Проверить:** под каким email залогинен пользователь в cookie / `/api/auth/me`.  
Если другой аккаунт — страница мгновенно уходит на `/profile` (выглядит как «не открывается»).

**Замечание:** в `components/profile-header.tsx` allowlist для пункта меню **захардкожен отдельно** и может разойтись с сервером/`PACKAGES_ADMIN_EMAILS`.

### A2. Сессия / домен

`getSessionUser()` читает:

1. JWT cookie Next (`next_motionflow_session`)
2. fallback Laravel `motionflow_session`

Если открыт **другой host** (поддомен, preview, localhost vs prod) — cookie нет → redirect на `/`.

### A3. Studio API 403

UI после открытия дергает:

- `GET /api/studio/packages/authors`
- `GET /api/studio/packages?author=premiere-gal|spunkram`

Gate тот же: session + `isPackagesAdmin`.  
403 → страница может открыться, но UI покажет Forbidden / пусто.

---

## Симптом B — CORS в браузере

### B1. PUT zip на R2 (самый вероятный CORS) — высокий приоритет

Флоу upload в UI:

1. `POST /api/studio/packages/demo/presign` → `{ putUrl }` (same-origin, ок)
2. **Браузер** делает `PUT putUrl` на R2 endpoint (`*.r2.cloudflarestorage.com` или аналог)
3. `POST /api/studio/packages/demo/publish`

Шаг 2 — **cross-origin**. Если на **public R2 bucket** нет CORS для origin сайта, Chrome пишет CORS, хотя Studio API живой.

**Нужно на bucket (R2 CORS rules), примерно:**

```json
[
  {
    "AllowedOrigins": [
      "https://motionflow.pro",
      "https://www.motionflow.pro",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Уточнить фактические origins (preview URL, author subdomains).

**Альтернатива (код, не infra):** upload через server-side proxy (multipart → PutObject на сервере), тогда браузер не ходит на R2 напрямую.

### B2. Studio API без CORS-заголовков

`/api/studio/packages/*` **не выставляет** `Access-Control-Allow-*` и **нет** `OPTIONS`.

Same-origin (`https://motionflow.pro` → `/api/...`) — CORS не нужен.  
Cross-origin (другой порт/поддомен/отдельный фронт) — GET/POST упадут с CORS.

Если BE/FE открывают админку с другого origin — добавить CORS + credentials / или держать same-origin only.

### B3. R2Sync CORS (если ошибки с `/api/r2sync`)

У `/api/r2sync/*` CORS уже есть (`Access-Control-Allow-Origin: *` + headers для `x-r2sync-secret`).

Типичные ответы не CORS:

- **503** в production если нет `R2SYNC_ADMIN_SECRET`
- **401** если secret неверный

Десктоп-приложение обычно не упирается в CORS; если R2Sync дергают из браузера — смотреть preflight и secret.

---

## Симптом C — пустой R2 / ошибки без CORS

| Причина | Эффект |
|---------|--------|
| Нет / битые `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_CDN`, `R2_ENDPOINT`/`R2_ACCOUNT_ID` | List/presign падают; часть ошибок в list глотается → пустые таблицы |
| Нет объектов под `public/downloads/galtoolkit/` / `spunkram/` | Пустой listing (норма) |
| MySQL недоступен для `r2sync_events` | Events пустые (lazy `CREATE TABLE`) |

---

## Чеклист для BE / DevOps

1. [ ] Подтвердить email сессии = `basepackagehelp@gmail.com` (или добавить в `PACKAGES_ADMIN_EMAILS` и задеплоить).
2. [ ] В Network: открытие `/profile/packages` — есть ли **302** на `/` или `/profile`?
3. [ ] `GET /api/studio/packages/authors` — 200 или 403?
4. [ ] При upload: failing URL — `motionflow.pro` или `*.r2.cloudflarestorage.com`?
5. [ ] Если R2 — выставить **CORS на public bucket** (см. B1).
6. [ ] Prod env: `R2SYNC_ADMIN_SECRET` задан (для `/api/r2sync`).
7. [ ] R2 credentials на рантайме next-app совпадают с нужным public bucket.

---

## Быстрая диагностика по URL в DevTools

| Failed request | Действие |
|----------------|----------|
| Document `/profile/packages` → 302 `/profile` | Allowlist / email |
| Document → 302 `/` | Нет сессии / cookie domain |
| `/api/studio/packages/...` CORS | Другой Origin; нет CORS на Studio |
| `PUT` на R2 host CORS | Bucket CORS (B1) |
| `/api/r2sync/...` 503/401 | `R2SYNC_ADMIN_SECRET` |

---

## Ссылки на код

- Redirect gate: `app/(main)/(profile)/profile/packages/page.tsx`
- Allowlist: `lib/packages-admin.ts`
- Client upload PUT: `components/packages-studio.tsx` (после presign)
- Studio (без CORS): `app/(main)/api/studio/packages/**`
- R2Sync (с CORS): `app/(main)/api/r2sync/**`
- Presign: `app/(main)/api/studio/packages/demo/presign/route.ts`

---

## Рекомендуемый порядок фикса

1. Infra: CORS на R2 public bucket (если в Network виден PUT на R2).  
2. Auth: подтвердить email / `PACKAGES_ADMIN_EMAILS`.  
3. По желанию: CORS на `/api/studio/*` или server-side upload вместо browser PUT.  
4. Выровнять allowlist в header с `isPackagesAdmin` / env.
