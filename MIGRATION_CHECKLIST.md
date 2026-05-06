# Чек-лист миграции: aniomLaravelSite → Next.js (motionflow)

Сравнение **`C:\Users\nipap\Downloads\aniomLaravelSite-main\aniomLaravelSite-main`** (исходный Laravel-сайт) **vs текущий Next.js-проект** (`next-app`).

Легенда:
- `[x]` — реализовано в Next.js (полно или MVP)
- `[~]` — частично реализовано / заглушка / отличается от Laravel
- `[ ]` — нужно реализовать

База данных MySQL общая — переносится только UI и логика чтения/записи (как и зафиксировано в `ADMIN_MIGRATION.md`).

---

## 1. Фундамент / инфраструктура

- [x] App Router (Next.js 16, React 19) с route groups `(main)`, `(authors)`, `(adminzone)`
- [x] Подключение к MySQL (`mysql2`) — `lib/db.ts`
- [x] Redis (`ioredis`) — `lib/redis.ts`
- [x] Edge `proxy.ts` (middleware) — гейт `/profile`, `/adminzone`, rewrite сабдомена `spunkramv2.motionflow.pro`
- [x] Сессии: совместимость с Laravel cookie + собственные JWT (jose) — `lib/auth/session.ts`, `lib/auth/laravel-session.ts`
- [x] RBAC по `users.access` (0 buyer / ≥1 partner / ≥2 author / ≥50 investor / 100 admin) — `lib/auth/access-control.ts`
- [x] Theme provider (next-themes), Toaster (sonner), Vercel Analytics
- [x] Tailwind v4 + shadcn/ui (Radix) — `components/ui/*`
- [x] Paddle.js client + provider — `lib/paddle.tsx`, `lib/paddle-server.ts`
- [x] Cloudflare R2 / S3 storage helpers — `lib/r2-storage.ts`, `lib/marketplace-r2-presign.ts`
- [x] Replicate API (для AI-генерации) — `lib/replicate-*.ts`
- [ ] Laravel-эквивалент `under-construction` middleware и страница maintenance
- [ ] Sitemap-генератор (Laravel `SitemapGenerate.php`) — нет аналога в Next.js
- [ ] Полноценный `CustomMeta` SEO-конструктор с breadcrumbs schema (есть только базовые `metadata`)
- [ ] CSRF / `re-token` маршрут (в Laravel `Route::post('re-token')`) — на Next нативно через cookie/SameSite, явный эквивалент не требуется, но проверить session refresh

---

## 2. Аутентификация и пользователи

| Laravel | Next.js | Статус |
|---|---|---|
| `GET /sign` (LoginController) | модал `SignInModal` (`components/sign-in-modal.tsx`) | [x] |
| `POST /auth/login` (LoginController) | `POST /api/auth/login` | [x] |
| `POST /auth/register` (RegisterController) | `POST /api/auth/register` | [x] |
| `GET /auth/google/login` + callback (Socialite) | `GET /api/auth/google` + `/api/auth/google/callback` | [x] |
| `POST /password/email` (ForgotPasswordController) | — | [ ] |
| `GET /password/reset/{token}` + `POST /password/reset` | — | [ ] |
| `GET /email/verify/{id}/{hash}` (VerificationController) | — | [ ] |
| `GET /email/verify` (notice) | — | [ ] |
| `POST /email/resend` | — | [ ] |
| `ANY /auth/logout` | `POST /api/auth/logout` | [x] |
| `Auth::loginUsingId` после Google | `setSessionCookie` после OAuth | [x] |
| `users.access` middleware (`user`, `partner`, `author`, `admin`, `investor`) | `ensureInvestor`, `ensureAdmin`, `ensurePartner`, `ensureAuthor` | [x] |
| `GET /api/auth/me` | `GET /api/auth/me` | [x] |
| `PATCH /api/auth/profile` (имя, аватар, пароль) | `PATCH /api/auth/profile` | [x] |
| Welcome promo-bonus + email при регистрации (`Notifies::addUserPromoBonus`) | — | [ ] |
| `MatchOldPassword` rule при смене пароля | проверить parity | [~] |

---

## 3. Главная / маркетплейс (домен `APP_URL`)

| Laravel | Next.js | Статус |
|---|---|---|
| `GET /` → `MarketplaceItemController@mainPage` (`marketplace.blade.php`) | `app/(main)/(app)/page.tsx` → `HomePage` с `getHomeSections()` | [x] (новый дизайн, не порт Blade) |
| `GET /{word}/{word2?}` категории/подкатегории (`categoryAction`) | `/footages`, `/sound-fx`, `/stock-audio`, `/after-effects`, `/premiere-pro`, `/davinci-resolve`, `/illustrator` (статические) | [~] (отдельные страницы по типам, нет универсального роутинга `/{slug}/{sub?}`) |
| `GET /item/{slug}/{id}/{action?}` (`itemAction`) | `/item/[id]` нет в `(main)`, есть только `app/(authors)/spunkram/item/[id]` | [~] (только sandbox для Spunkram, нет общего `/item/...`) |
| Sort options (`newest`, `popular`, `best-rating`, `last-update`, `popular-weekly`) + фильтры (free, subscription, demo, attributes, tags) | `components/filter-bar.tsx`, `components/category-page-layout.tsx` | [~] (UI частично, серверная сортировка/фильтры — проверить) |
| Поисковая строка + `SearchQueryStats` | — нет поиска в маркетплейсе на Next | [ ] |
| `ItemPopularityController` / `ViewsCounter` инкремент | — | [ ] |
| `ItemRatingController` (рейтинг/звёзды) | — | [ ] |
| `BadgesController` (`/badges`) | — | [ ] |
| `MarketplaceProfileController@profilePage` `/profile/{user_profile}` | — | [ ] |
| Subdomain автора (`{user_profile}.APP_URL`) — редирект и render | rewrite только для `spunkramv2.motionflow.pro` в `proxy.ts` | [~] |
| 301 со старого `/profile/{user_profile}` на сабдомен (vanity список) | — | [ ] |

---

## 4. Корзина / покупка / чекаут

| Laravel | Next.js | Статус |
|---|---|---|
| `ANY /cart` (`CartController@main`) — добавить/удалить/применить купон/чекаут | — нет страницы корзины | [ ] |
| `couponService::checkCouponCode`, проверка дат, лимит uses, статус | — | [ ] |
| `Checkout/PaymentProcessing` — оркестрация платежа | подписки через Paddle (`lib/paddle-server.ts`); единичных покупок нет | [~] |
| `Checkout/PaymentServices/GatewayPaddle` (Paddle.com) | `@paddle/paddle-js` overlay + server `lib/paddle-server.ts` | [x] (для подписок) |
| `Checkout/PaymentServices/GatewayPayProGlobal` | — | [ ] |
| `Checkout/PaymentServices/GatewayFastSpring` | — | [ ] |
| `POST /paddle/custom-checkout` (PaddleCustomCheckoutController, custom-price) | — (см. `paddle-test-checkout/page.tsx`, заглушка) | [ ] |
| `POST /webhook/{word}` (вебхуки платёжек) | `POST /api/paddle/webhook` | [x] (только Paddle) |
| `SoldItems::create`, history, refund | — нет таблицы продаж в /api | [ ] |

---

## 5. Подписка

| Laravel | Next.js | Статус |
|---|---|---|
| `GET/POST /subscription` (`SubscriptionController@main`) — лендинг + step=payment + step=processing | `/pricing` (`pricing-page-client.tsx`) — лендинг и оформление через Paddle | [x] (новый дизайн) |
| `SubscriptionSystem` (модель состояния подписки) | `lib/subscriptions.ts` (CRUD по той же таблице) | [x] |
| `SubscriptionDownloads` (учёт скачиваний по подписке) | `lib/marketplace-download-rate-limit.ts` + `lib/downloads.ts` | [x] |
| `getUserSubscription`, `getUserSubscriptionList` | `lib/subscriptions.ts` | [x] |
| Cancel / pause / resume подписку | `/api/subscription/scheduled-change`, `/api/subscription/schedule-downgrade` | [x] |
| Upgrade / preview upgrade | `/api/subscription/upgrade`, `/api/subscription/preview-upgrade` | [x] |
| `ApiStickSubsMf` (внешний REST для проверки подписки extension) | `/api/me/subscription-status` (внутренний) | [~] (внешнее API стика — проверить) |

---

## 6. Профиль покупателя (`/...` → Next `/profile/...`)

| Laravel | Next.js | Статус |
|---|---|---|
| `/favorites` (`favoritesPage`) | `/profile/favorites` | [x] |
| `/following` (`followingPage`) | — | [ ] |
| `/my_purchases` (`purchasesPage`) | `/profile/purchases` | [x] |
| `/my_subscription` (`subscriptionPage`) | `/profile/subscriptions` | [x] |
| `/my_downloads` (`downloadsPage`) | `/profile/downloads` + `/profile/downloads/download-limit` | [x] |
| `/settings/{tab?}` (`settingsPage`) | `/profile` (`ProfileSettings`) — общий tab; пароль/имя/email | [~] (нет вкладок, нет аватара/badge-настроек) |
| `/notifications` (`notifyPage`) | — | [ ] |
| Фоллов авторов (`UserFollowing`) | — | [ ] |
| Бейджи в профиле (`parseUserAwards`) | — | [ ] |
| `/profile/{user_profile}` публичный профиль | — | [ ] |

### Эксклюзивно в Next (нет в Laravel)
- [x] `/profile/generations` — мои AI-генерации (`profile-generations*.tsx`)
- [x] AI-инструменты `/image-generation`, `/image-edit`, `/video-generation`, `/text-to-speech`, `/speech-to-text`
- [x] Покупка extra generation packs (`/api/me/extra-generations/claim`, `/api/paddle/extra-generation-prices`)
- [x] `lib/user-generation-credits.ts`, `lib/generation-records.ts`
- [x] Stock providers: Unsplash, Pexels (`/api/stock/unsplash`, `/api/stock/pexels/videos`)

---

## 7. Партнёрский раздел (access ≥ 1, Laravel `partner` middleware)

| Laravel | Next.js | Статус |
|---|---|---|
| `/affiliate/{word?}` (`Contributor\Affiliate@index`) | `/profile/affiliate` | [x] (Done — см. `ADMIN_MIGRATION.md`) |
| `/payouts/{word?}` (`Contributor\Payouts@index`) | `/profile/payouts` + `/setup` + `/invoice/[id]` | [x] |
| `/earnings/{word?}` (`Contributor\Earnings@index`) — sales/subscription/subscribers | `/profile/earnings/[section]` | [x] (подписочная вкладка admin-only — соответствует Laravel) |
| `ShortLinks` для аффилейт-ссылок (создание / редирект) | `/profile/affiliate` API | [x] (создание); редирект `/l/{word}` ниже | 

---

## 8. Раздел автора (access ≥ 2, Laravel `author` middleware)

| Laravel | Next.js | Статус |
|---|---|---|
| `/dashboard` (`Contributor\Dashboard`) | `/profile/dashboard` | [x] |
| `/upload/{category?}` (`Contributor\ItemManager@uploadItem`) | `/profile/upload` + `/profile/upload/[category]` | [x] (MVP) |
| Загрузка файлов: chunked temp + Editor.js + per-category attribute blocks + price block | `POST /api/profile/upload/draft` + `POST /api/profile/upload/sign` (presigned PUT в `preview/{itemId}/…`) | [~] (полный parity опционален — отмечено в ADMIN_MIGRATION) |
| `/my_items/{word?}` (`Contributor\Items@index`) | `/profile/items` (?team=1) | [x] |
| `/marketing/{section}/{word?}` (`Contributor\Marketing@index`) — coupons / search queries / notify | `/profile/marketing/{section}` | [x] |
| Auto-badges при upload/sale/favorites/subscribe (`BadgesController@templateAddBadgeAuto`) | — | [ ] |
| `coAuthorsTeam` (соавторы) — управление командой | — | [ ] |

---

## 9. Admin zone (access ≥ 50 / 100, Laravel `investor`/`admin`)

Гейт реализован в `proxy.ts` + `ensureInvestor` / `ensureAdmin`. См. `components/admin/admin-shell.tsx`, `components/admin/admin-sidebar.tsx`.

| Laravel | Next.js | Статус |
|---|---|---|
| `/adminzone[/dashboard]` (`Admin\Dashboard`) | `/adminzone/dashboard` (donut + bar charts, requests, users, emails) | [x] |
| `/adminzone/items_access/{wait\|soft\|reject\|blocked}` (`Admin\ItemsAccess`) | `/adminzone/items_access/[[...segments]]` + actions (approve/soft/hard/block/unblock) | [x] |
| `/adminzone/requests/{filter}` + `view?id=` (`Admin\Requests`) | `/adminzone/requests/[[...segments]]` + `/requests/view` | [x] |
| `/adminzone/search` (`Admin\Search`) — DB-поиск | `/adminzone/search` (универсальный SQL-поиск через `lib/admin/db-search.ts`) | [x] |
| `/adminzone/help_center/{word?}` (`Admin\HelpSection`) | `/adminzone/help_center` + `/create` + `/edit` (CRUD статей и категорий, без Editor.js) | [x] |
| `/adminzone/tutorials/{word?}` (`Admin\Tutorials`) | `/adminzone/tutorials` + `/create` + `/edit` (CRUD по `tutorial_items`, без Editor.js/локалей) | [x] |
| `/adminzone/control` (`Admin\Control`) | `/adminzone/control` (операционные действия + investment-money request) | [x] |
| `/adminzone/analytics` (`Admin\Analytics`) | `/adminzone/analytics` (subscription summary + per-author income) | [x] |
| `/adminzone/affiliate/{word?}` (`Contributor\Affiliate@adminIndex`) | `/adminzone/affiliate` (totals + sortable table + soft-delete/restore) | [x] |
| `/adminzone/coupons/{word?}` (`Contributor\Marketing@adminIndex`) | `/adminzone/coupons` + `/create` + `/edit` (CRUD по `coupon_services`) | [x] |
| `/adminzone/offers/{word?}` (`Admin\Offer`) — admin-only | `/adminzone/offers` + `/create` + `/edit` (CRUD по `offer_pages`, admin gate) | [x] |
| `/adminzone/mailing_marketing/{word?}` (`Admin\MailingMarketing`) — admin-only | `/adminzone/mailing_marketing` + `/create` + `/edit` (CRUD + recipients preview, dispatch не подключён) | [x] |
| `/adminzone/payouts` (`Admin\Payouts`) — admin-only (awaiting/success/cancel) | `/adminzone/payouts` (status × period фильтры, approve/cancel/reserve/unavailable, admin-only mutate) | [x] |
| `/adminzone/page_settings/{word?}` (`Admin\PageSettings`) — admin-only | `/adminzone/page_settings` + `/create` + `/edit` (text/json/key=value формат) | [x] |
| `/adminzone/investment` (`Admin\Investment`) | `/adminzone/investment` (donut + транзакции) | [x] |
| `/adminzone/viewPrivate/{view}/{arg?}` (`renderViewExample`) | — | [ ] |
| `/adminzone/testzone` | — | [ ] (вряд ли нужно) |
| `/adminzone/paddle-test-checkout` | `/adminzone/paddle-test-checkout` (рабочая форма с Paddle.js overlay) | [x] |
| `/adminzone/subs_users_has_pack_tests` | `/adminzone/subs_users_has_pack_tests` (probe пользователя по email/id с подпиской/credit-ledger) | [x] |
| Cmd+K command palette | `components/admin/admin-command-palette.tsx` + `/api/admin/command-search` | [x] (новое — нет в Laravel) |

---

## 10. Tutorials (сабдомен `tuts.APP_URL`)

| Laravel | Next.js | Статус |
|---|---|---|
| `GET tuts./` (`TutorialsController@mainPage`) | — нет рендеринга в Next | [ ] |
| `GET tuts./search` | — | [ ] |
| `GET tuts./profile/{user}` | — | [ ] |
| `GET tuts./{section}/{category?}/{article?}/{lang?}` | — | [ ] |
| `TutorialItem`, `ArticlesLocales` — модели | — | [ ] |

---

## 11. Help Center (сабдомен `help.APP_URL`)

| Laravel | Next.js | Статус |
|---|---|---|
| `GET help./` (`HelpCenterCategoryController@mainPage`) | — | [ ] |
| `ANY help./get-support` (форма поддержки + email + attach) | `/contact` (общий contact form) | [~] |
| `GET help./search` | — | [ ] |
| `GET help./{section}/{category?}/{article?}` | — | [ ] |
| `HelpCenterCategory`, `HelpCenterArticle` модели | — | [ ] |

---

## 12. AtomX extension (сабдомен `atomx.APP_URL`)

| Laravel | Next.js | Статус |
|---|---|---|
| `GET atomx./` (`AtomxController@mainPage`) | — | [ ] |
| `packagesPage`, `reviewsPage`, `tutorialsPage`, `becomePartnerPage`, `showChangeLog` | — | [ ] (закомментированы в Laravel — вероятно отложено) |

---

## 13. Статические / служебные страницы

| Laravel | Next.js | Статус |
|---|---|---|
| `/legal/terms-of-service` | `/terms` | [x] |
| `/legal/privacy-policy` | `/privacy` | [x] |
| `/legal/refund-policy` | `/refund` | [x] |
| `/contact` (`SomePageController@contactUs`) | `/contact` (`Contact.tsx`) | [x] |
| `/l/{word}` (`Responsible\ShortLinksController@redirectHandler`) — короткие ссылки + клик-счётчик | — | [ ] |
| License page | `/license` | [x] (новое) |
| Account redirect | `/account` | [x] |
| Subdomain demo (`{slug}.motionflow.pro`) | `/subdomain-demo/[slug]` через `proxy.ts` rewrite | [x] (новое) |

---

## 14. Email / уведомления / автоматизации

| Laravel | Next.js | Статус |
|---|---|---|
| `app/Mail/*` (Mailable классы — bug-report, contact, support, welcome, и т.д.) | — нет email-инфраструктуры | [ ] |
| `app/Notifications/*` (DB notifications — UserBadge, teamProject, userPromoBonus, …) | — | [ ] |
| `MailingMarketing` рассылки + `clicksCounters` | — | [ ] |
| `MailingUpdatesNotify` (нотификация автора) | — | [ ] |
| `mailing/unsubscribe`, `mailing/click` (`Automation\Mailing`) | — | [ ] |
| `Automation\Notifies` (welcome bonus, partner-promo) | — | [ ] |
| `Automation\AutoPosting` (auto-post в соцсети) | — | [ ] |

---

## 15. AJAX / служебные эндпоинты

| Laravel | Next.js | Статус |
|---|---|---|
| `POST /ajax/{word}` (`AjaxController@index`) — универсальный AJAX-фасад (content / requests / moderate / favorites / follow / cart / contact / freebie email и др.) | расщеплён на отдельные REST-роуты `/api/...` | [~] (что-то покрыто, что-то нет — см. ниже) |
| `GET /secure-dl/{id}` (`SecureDownloadController@download`, signed URL, expires) | `/api/download/[itemId]` (своя логика signed) | [~] |
| `POST /re-token` (CSRF refresh) | — (Next.js нативно) | [x] |
| Webhook payment | `POST /api/paddle/webhook` | [x] (только Paddle) |
| Sitemap (`SitemapGenerate.php`) | — | [ ] |
| `FreeDownloadEmails` (захват email перед бесплатным скачиванием) | — | [ ] |

---

## 16. Реализованные API-маршруты Next.js (нет аналога в Laravel или дополнительные)

Для контекста — что уже есть в `app/(main)/api/...`:

- `/api/auth/login`, `/register`, `/logout`, `/me`, `/profile`, `/google`, `/google/callback`
- `/api/profile/upload/draft`, `/sign`, `/[itemId]`
- `/api/profile/payouts/setup`
- `/api/me/can-download`, `/subscription-status`, `/generations`, `/generation-records`, `/extra-generations/claim`
- `/api/subscription/scheduled-change`, `/upgrade`, `/preview-upgrade`, `/schedule-downgrade`
- `/api/paddle/webhook`, `/extra-generation-prices`
- `/api/download/[itemId]`, `/download-generation-asset`, `/replicate-files/[fileId]`
- `/api/generations/image`, `/image-edit`, `/image-upscale`, `/image-remove-background`, `/video`, `/video/first-frame-upload`, `/tts`, `/stt`
- `/api/stock/unsplash`, `/unsplash/[id]`, `/pexels/videos`, `/download`
- `/api/market-items`, `/favorites`, `/audio-peaks`, `/audio-proxy`
- `/api/admin/command-search`, `/admin/user-generation-credits`

---

## 17. БД-миграции / схема

Схема MySQL общая с Laravel и **не меняется**. Дополнительные таблицы Next.js (для AI-функционала) уже накатаны через `db/migrations/*.sql`:

- [x] `user_generations`, `generation_records`, `user_generation_credits`
- [x] `subscription_systems` расширения (paddle_*, scheduled_change, paddle_billing_period)
- [x] `paddle_extra_generation_credit_events`
- [x] `users.extra_generations_count`
- [x] `replicate_delivery_records` (инвалидация по TTL)

Laravel-миграции, на которые опирается Next-код (схема уже есть на сервере):
- users, marketplace_items, sold_items, subscription_systems, subscription_downloads
- payouts, coupon_services, short_links, mailing_*, request_messages, approval_requires
- user_favorites, user_followings, item_ratings, item_popularities, views_counters, clicks_counters
- search_query_stats, offer_pages, page_settings, invest_analyses, notifications
- help_center_articles/categories, tutorial_items, articles_locales
- free_download_emails

---

## 18. Что в первую очередь стоит реализовать (приоритет)

### P0 — блокеры коммерции
1. [ ] Универсальная страница товара `/item/[slug]/[id]` (порт `MarketplaceItemController@itemAction`) — сейчас работает только Spunkram.
2. [ ] Корзина `/cart` + купоны (`CartController` + `couponService`).
3. [ ] Чекаут разовой покупки (PaymentProcessing, `SoldItems::create`, refund).
4. [ ] Reset password (`/password/email`, `/password/reset/{token}`) + email-инфраструктура.
5. [ ] Email verification (`/email/verify/{id}/{hash}`, notice, resend).

### P1 — функциональный паритет публичной части
6. [ ] Поиск по маркетплейсу + `SearchQueryStats`.
7. [ ] Универсальная категория `/{slug}/{sub?}` с сортировкой/фильтрами.
8. [ ] Публичный профиль `/profile/{user}` + сабдомен авторов.
9. [ ] Help Center (сабдомен `help.`) + статьи + поиск.
10. [ ] Tutorials (сабдомен `tuts.`) + локали.
11. [ ] AtomX лендинг (сабдомен `atomx.`).
12. [ ] `/badges` + auto-награды (`BadgesController@templateAddBadgeAuto`).
13. [ ] `/following`, `/notifications`, фолловинг авторов.
14. [ ] Item rating + popularity counters + views.
15. [ ] Short links `/l/{word}` + клик-счётчик.
16. [ ] Free download email gate (`FreeDownloadEmails`).

### P2 — паритет admin zone
17. [x] `/adminzone/help_center` CRUD статей (Editor.js всё ещё в roadmap, HTML сохраняется).
18. [x] `/adminzone/tutorials` CMS (Editor.js + locales-форма всё ещё в roadmap).
19. [x] `/adminzone/control` (операционные переключатели + investment money request).
20. [x] `/adminzone/analytics` (subscription summary + per-author breakdown).
21. [x] `/adminzone/coupons` (CRUD coupon_services + поиск + сортировка).
22. [x] `/adminzone/offers` admin (`offer_pages`, admin-only mutate).
23. [x] `/adminzone/mailing_marketing` (рассылки + recipients preview; реальная отправка email — отдельный пункт P3).
24. [x] `/adminzone/payouts` (queue: awaiting/approved/cancelled/reserved/unavailable, period filter).
25. [x] `/adminzone/page_settings` (text / JSON / key=value формат).
26. [x] `/adminzone/affiliate` admin-обзор.
27. [x] `/adminzone/paddle-test-checkout` — рабочая форма (Paddle.js overlay; custom-price API endpoint всё ещё в P0/P4).
28. [x] `/adminzone/subs_users_has_pack_tests` — снимок подписки/кредитов пользователя.

### P3 — автоматизации
29. [ ] Email-инфраструктура (Mailable аналог: nodemailer / resend / postmark).
30. [ ] DB-нотификации + страница `/notifications`.
31. [ ] Welcome promo-bonus при регистрации.
32. [ ] `Automation\Mailing` (unsubscribe + click tracking).
33. [ ] `Automation\AutoPosting`.
34. [ ] `MailingUpdatesNotify` для авторов.
35. [ ] Sitemap-генератор.

### P4 — расширения / опционально
36. [ ] Полный parity загрузки автора: chunked temp upload, Editor.js, per-category attribute blocks, price block.
37. [ ] Дополнительные платежные шлюзы (PayProGlobal, FastSpring).
38. [ ] `coAuthorsTeam` (соавторы).
39. [ ] Внешний `ApiStickSubsMf` (`/api/mf_subscription/check`, `/recheck`) для extension.
40. [ ] `CustomMeta` SEO-конструктор + breadcrumbs schema.org.

---

## 19. Сводка по числу страниц / контроллеров

| Скоуп | Laravel | Next.js (готово) | Next.js (заглушка) |
|---|---|---|---|
| Auth | 7 контроллеров | login/register/logout/me/profile/google | reset, verify (нет) |
| Маркетплейс публ. | 1 контроллер (~94KB) | home, авторская страница Spunkram | универсальный item / категории |
| Корзина / покупка | 1 контроллер + 3 шлюза | Paddle (sub) | разовый чекаут |
| Подписка | 1 контроллер | полный CRUD + upgrade/downgrade | — |
| Профиль покупателя | 7 секций | favorites/purchases/subs/downloads/settings | following/notifications/public profile |
| Партнёр | 3 контроллера | affiliate/payouts/earnings | — |
| Автор | 4 контроллера | dashboard/items/marketing/upload (MVP) | полный upload-парити |
| Admin zone | 13 контроллеров | dashboard/items/requests/search/investment + help_center/tutorials/control/analytics/coupons/offers/mailing/payouts/page_settings/affiliate-admin/paddle-test/subs-pack-tests | viewPrivate, testzone (опционально) |
| Tutorials (сабдомен) | 1 контроллер | — | весь раздел |
| Help (сабдомен) | 1 контроллер | — | весь раздел |
| AtomX (сабдомен) | 1 контроллер | — | весь раздел |
| Уведомления / email | папки `Mail/`, `Notifications/`, `Automation/` | — | вся email/notify-инфра |
| Sitemap | 1 контроллер | — | — |

---

_Документ сгенерирован автоматическим обзором кода. Используется в дополнение к `ADMIN_MIGRATION.md` (фокус на `/adminzone` и `/profile`)._
