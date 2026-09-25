# Motion Flow — Affiliate / Partners

Собери систему аффилиатов на текущем Next.js-сайте Motion Flow (`motionflow`). Не изобретай отдельный админ-сайт. Встрой в профиль, в тот же визуал (тёмный UI, Tailwind, как Packages / Extensions / payouts).

Отвечай на русском в чате. Код — на английском, как в репо.

## Контекст продукта

Сайт: motionflow.pro. Стек: Next.js, TypeScript, Tailwind, MySQL (`lib/db.ts`), сессии как сейчас.

Оплата подписок — Paddle. Комиссия аффилиата считается так:

1. Берётся **фактическая сумма транзакции**, которую заплатил покупатель (то, что пришло в Paddle webhook: line totals / `sold` amount).
2. Из неё вычитается **Paddle fee**. Если в вебхуке есть реальный fee/tax — используй его. Иначе (и как fallback) формула из `lib/paddle-laravel-port.ts`: `5% + $0.50` (`PADDLE_TXN_TAX_PERCENT` / `PADDLE_TXN_TAX_FLAT`).
3. От остатка аффилиат получает свой **процент** (например 50% → деление пополам).

Пример: подписка $29, fee $1.95, net $27.05, партнёр 50% → **$13.525** (округляй до центов, banker/half-up, один раз в конце).

Это **новые** аффилиаты Motion Flow (маркетинг подписок), не путать с уже существующим `affiliate_ref` / `ref_author_id` у авторов маркетплейса в `lib/author/earnings.ts` и `lib/paddle-laravel-port.ts`. Старый author-affiliate **не ломать**. Новые таблицы и поле атрибуции — отдельные.

## Кто что видит

### Админ: вкладка Partners

Показывать в профиле (сайдбар / `components/profile-header.tsx` + `profile-shell`, по аналогии с Authors → `/profile/packages`) только админам.

Доступ: username **`ionestudio`** и/или email-лист через env (как `isPackagesAdmin` в `lib/packages-admin.ts`). Сделай `isAffiliateAdmin(user)` + `AFFILIATE_ADMIN_EMAILS`. Не хардкодь один email в пяти файлах.

Роуты (предложение):

- `/profile/partners` — сводка + список партнёров
- `/profile/partners/new` — создание
- `/profile/partners/[id]` — карточка партнёра
- `/profile/partners/payouts` — выплаты за прошлый месяц / история

Ширина страниц: как Packages, `PROFILE_PAGE_CLASS_WIDE` в `lib/profile-layout.ts`.

### Аффилиат: вкладка Affiliate

После создания партнёра (аккаунт уже есть **или** он принял инвайт и зарегистрировался) у него в профиле вкладка **Affiliate**:

- `/profile/affiliate` — статистика и привлечённые
- `/profile/affiliate/payouts` — Payoneer + статусы выплат

Обычным юзерам вкладки нет.

## Создание аффилиата (админ)

Форма:

| Поле | Смысл |
|---|---|
| Name | Отображаемое имя |
| Social link | Одна URL соцсети |
| Email | Куда инвайт / к какому аккаунту привязать |
| Commission % | 1–100, например 50 |
| Recurring | **Каждая** последующая оплата этого подписчика **или только первая** транзакция |
| Slug | Короткое слово в ссылке, уникальное, `[a-z0-9-]`, 3–32 символа |

После сохранения **сгенерировать ссылку**: `https://motionflow.pro/?ref={slug}` (и дублировать короткую через существующий `short_links` / `/l/[slug]`, если удобно — но cookie/атрибуция обязаны работать с `?ref=`).

Поведение email:

- Аккаунта нет → письмо-приглашение (как `authorAccessInviteEmail` / `lib/mail/templates.ts` + Resend): ссылка зарегистрироваться / задать пароль. После логина роль аффилиата уже привязана к этому email.
- Аккаунт есть → инвайт не обязателен; сразу `user_id` + вкладка Affiliate.

Нельзя создать двух партнёров с одним email или одним slug.

Админ должен уметь **редактировать** % / recurring / social / имя, **деактивировать** (ссылка перестаёт писать cookie, выплаты по уже начисленному остаются). Slug после создания лучше не менять (или менять с редиректом старого).

## Атрибуция

- По `?ref=slug` ставить cookie (httpOnly, `SameSite=Lax`, **30 дней**, last-click: новый валидный ref перезаписывает).
- При регистрации/логине сохранить `referred_by_affiliate_id` на пользователе, если cookie есть и поле ещё пустое (**first-touch на юзера**: кто привёл аккаунт). Если уже был `referred_by` — не перетирать.
- Self-referral запрещён (свой slug / свой email).
- В Paddle Checkout (`components/pricing-page-client.tsx`) в `customData` передать `affiliate_id` / slug из cookie, чтобы webhook не потерял атрибуцию.
- В обработчике Paddle (`lib/paddle-server.ts` и/или `lib/paddle-laravel-port.ts`) при успешной транзакции подписки Motion Flow:
  - найти аффилиата приведённого `buyer_id`;
  - если режим «только первая транзакция» и по этому buyer уже есть выплаченная/начисленная комиссия — **не начислять**;
  - если recurring — начислять на каждый successful charge (renewal, смена плана — да, если это новая оплата; scheduled change без денег — нет);
  - refund/chargeback: сторнировать комиссию (отрицательная строка), не уходить в минус по уже выплаченному месяцу без пометки «adjustment» админу.

Не аттрибутить: пакеты extra generations, Spunkram, Premiere Gal — только планы Motion Flow Creator / Creator + AI, пока админ не расширит.

## Начисление

Таблица комиссий (пример `affiliate_commissions`):

- affiliate_id, buyer_user_id, paddle_transaction_id / payment_id, subscription_id
- plan, billing_period, gross_amount, paddle_fee, net_amount, commission_percent, commission_amount
- status: pending / approved / reversed
- created_at (дата платежа)

Идемпотентность по `payment_id`. Нельзя начислить дважды за один webhook.

Валюта: USD.

## Админ UI

### `/profile/partners` сверху — статистика

- Число партнёров (active / all)
- Сумма комиссий (начислено)
- Сумма уже выплаченного
- Число привлечённых подписчиков (уникальные buyer)
- Фильтр периода: this month / last month / custom range (как попросил пользователь на стороне аффилиата — тот же паттерн и здесь)

Ниже таблица партнёров: имя, slug, email, %, recurring, ссылка (copy), привлечено, заработано за период, статус. Клик → `/profile/partners/[id]`.

Кнопка Create partner.

### Карточка партнёра

Шапка: имя, social, email, %, first-only/recurring, ссылка, даты.

Таблица **каждого привлечённого подписчика** (не агрегатом):

- email покупателя (админу можно полный)
- когда зарегистрировался / когда первая оплата
- какой план (Creator / Creator + AI, monthly/yearly)
- gross, fee, net, комиссия партнёра
- это первая или повторная оплата

Фильтры периода те же.

### `/profile/partners/payouts`

Две подвкладки: **Due** и **Paid**.

- Обычный цикл: **15-е число** выплата **за предыдущий календарный месяц** (1–последний день прошлого месяца, UTC или `Europe/Moscow` — зафиксируй **UTC**, напиши в UI).
- Due: по каждому активному аффилиату сумма `SUM(commission)` за прошлый месяц, статус «к выплате», Payoneer email если указал, кнопка **Mark as paid**.
- По кнопке: создаётся/закрывается payout, статус paid, `paid_at`, кто отметил. У аффилиата в его кабинете статус тоже **Paid**.
- Paid: история. Нельзя дважды выплатить один и тот же месяц одному партнёру.

Не автоплатёж Payoneer — только ручная отметка админом.

## Кабинет аффилиата

Дефолтный фильтр списка: **Current month**. Ещё: Last month, Custom range.

Показать:

- клики / визиты по ссылке (если трекаешь), регистрации, оплаты, комиссия за период
- его публичную ссылку + copy
- таблица привлечённых: **email** (полный, это его лиды), дата, план, **его комиссия уже после Paddle fee и его %**
- не показывать чужие проценты админской маржи сверх необходимого; не показывать Paddle raw secrets

Вкладки внутри Affiliate: Overview / Payouts (можно query `?tab=` или вложенный route).

### Payouts у аффилиата

- Поле **Payoneer email**, сохранить в профиль партнёра. Без него админ всё равно видит due, но в UI пометка «no Payoneer».
- Список выплат: период (Aug 2026), сумма, статус Pending / Paid, дата выплаты.
- Текст-напоминание: выплаты **в середине месяца (15-е) за предыдущий месяц**.

Синхронизация статусов с админской кнопкой обязательна (одна таблица `affiliate_payouts`).

## Трекинг ссылки

Минимально:

- `GET /` и внутренние страницы читают `?ref=`
- пишут cookie
- опционально `affiliate_link_hits` (slug, date, ip hash) для админской статистики «привели»

Не ломай существующий `/l/[link]` (`app/(main)/(app)/l/[link]/page.tsx` + `short_links`).

## Данные / миграции

Новые таблицы (имена на твоё усмотрение, SQL-миграция в стиле репо):

- `affiliates` (user_id nullable до принятия инвайта, email, name, social_url, slug unique, commission_percent, recurring_mode enum first_only|all, status, invite token, payoneer_email, timestamps)
- `affiliate_commissions`
- `affiliate_payouts` (affiliate_id, period_start, period_end, amount, status, paid_at, paid_by)
- `affiliate_link_hits` опционально
- на `users`: `referred_by_affiliate_id` nullable

Не клади секреты в клиент. API только session cookie, админские route — `isAffiliateAdmin`, партнёрские — владелец `affiliate.user_id === session.id`.

## Письма

Инвайт: тёмный бренд как `renderMotionflowEmail` в `lib/mail/templates.ts`, Resend (`lib/mail/resend-mailer.ts`). Не Mailgun.

## UI

Как Motion Flow: navy/blue, таблицы как Packages/Extensions, не фиолетовый Spunkram. Пустые состояния. Копирование ссылки — toast.

Названия в UI:

- админ: **Partners**
- партнёр: **Affiliate**
- выплаты: **Payouts** / Due / Paid («Выплаченные»)

Язык интерфейса профиля — английский, как остальной кабинет.

## Не делать

- Не слать массовые письма через Mailgun.
- Не переиспользовать `users.access` partner=1 как единственный флаг (это уже авторы/партнёры маркетплейса). Роль аффилиата — отдельная таблица.
- Не менять Paddle price IDs и не ломать текущий checkout, кроме `customData` + cookie.
- Не делать публичный лендинг «станьте аффилиатом», пока не попросили.

## Порядок работ

1. Миграции + lib (CRUD, cookie, attribution, commission math, payouts).
2. Paddle webhook hook + checkout customData.
3. Админ UI Partners / detail / payouts.
4. Инвайт-письмо + активация.
5. Кабинет аффилиата + Payoneer.
6. Проверка: создать партнёра, открыть `?ref=`, зарегистрировать тестового, «оплатить» (или симулировать webhook), увидеть строку у админа и у партнёра, отметить выплату — статус с обеих сторон Paid.

## Критерии готовности

- Админ ionestudio видит Partners, создаёт партнёра, получает ссылку.
- Новый email получает инвайт; существующий сразу видит Affiliate.
- Покупка по ссылке создаёт комиссию по формуле fee → % .
- first_only vs all работает.
- Due 15-е / прошлый месяц; Mark as paid синхронизирует кабинеты.
- Старый author earnings/payouts не сломан.
