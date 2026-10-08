# Гайд по завершению переноса Motion Flow с Laravel на Next.js

Дата аудита: **4 октября 2026 года**. Исходники: `next-app` на коммите `d06860d` и соседний `laravel` на коммите `c4fe7a9`.

**Laravel пока нельзя отключить без потери части функций.** Основная витрина, авторизация, кабинет покупателя, значительная часть кабинета автора, Paddle и новые CEP API уже реализованы в Next.js. Оставшийся объём — полноценный цикл публикации товаров, операции старой админки, выплаты авторам, универсальные страницы товаров и лицензии, старые маркетинговые сценарии, контентные поддомены и окончательное переключение инфраструктуры.

Этот гайд объединяет найденные разрывы, порядок переноса и проверки перед отключением PHP. Он предназначен для постановки задач разработчикам и проверки готовности релиза.

## 1. Что подтверждено и что ещё нужно проверить

Проведён **статический аудит двух локальных репозиториев**: маршрутов, контроллеров, моделей, SQL, фоновых задач, компонентов и существующих документов. Продакшен, база данных, объекты R2, конфигурация nginx, кабинеты платёжных провайдеров, cron и запущенные очереди не проверялись. «Есть в Next.js» означает наличие реализации в коде, а не подтверждённый успешный production E2E.

Статусы:

- **Есть** — найден самостоятельный путь в Next.js; требуется приёмка и переключение трафика.
- **Частично** — есть реализация, но остаётся разрыв или переход в Laravel.
- **Не найдено** — в просмотренном дереве Next.js не обнаружен соответствующий рабочий маршрут или операция.
- **Решение команды** — функцию можно перенести, заменить другим сервисом или явно вывести из эксплуатации. Закрытие означает обработку старых URL, данных и обязательств перед пользователями.

Приоритеты: **P0** — блокирует отключение Laravel для денег, доступа, публикации или используемых клиентами контрактов; **P1** — закрыть до полного отключения, если сценарий сохраняется; **P2** — переносить по подтверждённой потребности. Это рекомендуемые приоритеты, а не данные о частоте использования.

Миграция приложения не требует одновременно менять MySQL. Next.js уже напрямую работает с прежними таблицами. Сохранить базу и R2 на первом этапе — разумный способ уменьшить объём переключения.

Ссылки на Next.js ниже ведут в этот репозиторий; ссылки на Laravel — в соседнюю папку `../../laravel` относительно этого документа.

## 2. Что уже перенесено

| Область | Подтверждённая реализация в Next.js | Что ещё нужно сделать |
|---|---|---|
| Каталог и категории | [market-items.ts](../lib/market-items.ts), `/`, `/after-effects`, `/premiere-pro`, `/davinci-resolve`, `/stock-audio`, `/sound-fx` и другие страницы | Проверить покрытие прежних категорий, подкатегорий и фильтров; универсальные страницы товаров ещё зависят от Laravel |
| Авторизация | `/api/auth/*`, [get-session-user.ts](../lib/auth/get-session-user.ts), bcrypt, Google OAuth, подтверждение email и сброс пароля | Завершить переход с общего Laravel session bridge, сохранить доступ старых пользователей и обработать старые ссылки из писем |
| Кабинет покупателя | `/profile/purchases`, `/profile/subscriptions`, `/profile/downloads`, `/profile/favorites`, `/profile/generations` | Перенести персональные лицензии; решить судьбу following, notifications и расширенных настроек профиля |
| Кабинет автора | `/profile/dashboard`, `/profile/items`, `/profile/earnings/*`, `/profile/payouts`, `/profile/payouts/setup`, `/profile/payouts/invoice/[id]` | Список товаров и просмотр выплат не заменяют управление публикациями и расчёт выплат |
| Загрузка товара | `/api/profile/upload/draft`, `/sign`, `/[itemId]`, [upload-draft-form.tsx](../components/author/upload-draft-form.tsx) | MVP без полного private upload, обработки медиа, модерации и жизненного цикла релиза |
| Paddle | `/api/paddle/webhook`, [paddle-server.ts](../lib/paddle-server.ts), [paddle-laravel-port.ts](../lib/paddle-laravel-port.ts), `/api/subscription/*` | Не переписывать заново; проверить совместимость всех старых покупок/подписок, события, комиссии и маршрутизацию webhook |
| Пользователи и выдача доступа администратором | `/profile/users`, `/api/admin/users/*`, [admin-users.ts](../lib/admin-users.ts), [account-audit.ts](../lib/account-audit.ts) | Это часть админки, а не замена всего `/adminzone` |
| Новая партнёрская программа | `/profile/affiliate`, `/profile/partners`, `/api/affiliate/*`, `/api/partners/*`, [lib/affiliate](../lib/affiliate) | Согласовать миграцию старых short-link referrals и их комиссий |
| CEP, пакеты, R2Sync, Odin | `/api/cep/*`, `/profile/packages`, `/profile/extensions`, `/api/packages/*`, `/api/r2sync/*`, `/api/integrations/odin/*` | Проверить реальные клиенты и оставшиеся старые API/внешние зависимости; не путать пакеты расширений с обычными marketplace uploads |
| Gal Toolkit и Spunkram | `/premiere-gal`, `/premiere-gal/showcase`, `/spunkram`, `/spunkram/item/[id]`, demo/install/download API | Для других авторов универсального storefront-пути пока нет |
| Старые публичные API | `/api/user`, `/api/item/{verify,earnings,sales,details}`, `/api/get-marketplace`, `/api/get-galtoolkit-showcase`, `/api/mf_subscription/{check,recheck}`, `/api/send-galtoolkit-contact-form` | Проверить методы, payload, заголовки, авторизацию и домены у установленных клиентов |
| Контактная форма | `/api/contact`, [contact-requests.ts](../lib/contact-requests.ts), запись в `request_messages` | Нужен самостоятельный процесс обработки заявок и ответов |
| Статические страницы | `/terms`, `/privacy`, `/refund`, `/license`, `/contact` | Нужна карта старых URL и сверка содержания; `/license` — общие условия, а не персональный документ о покупке |

### Расхождение с прежними документами

В [ADMIN_MIGRATION.md](../ADMIN_MIGRATION.md) фазы 0–7 отмечены как Done/MVP, включая маркетинг и старую affiliate CRUD. Однако на дату аудита:

- В дереве `app` нет `/profile/marketing/*` и `/api/profile/marketing/coupons`; нет также старого `/api/profile/affiliate/*`. Есть новая программа `/api/affiliate/*`, которую нужно оценивать отдельно.
- В `next.config.mjs` сегмент `marketing` отсутствует в allowlist для `/profile/:slug`; добавление страницы без обновления этого правила приведёт к редиректу на `/profile`.
- Upload существует как MVP, но не заменяет весь Laravel publishing pipeline.
- Кабинет выплат и инвойс выплаты есть; месячное формирование marketplace payouts в Next.js не найдено.

Поэтому старый документ нельзя использовать как единственное основание для отключения Laravel. [«Операция Отречение»](operaciya-otrechenie.md) описывает отказ от AtomX; это связанная, но отдельная миграция. Часть её задач уже имеет более свежую реализацию в текущем дереве — её чекбоксы также требуют сверки с кодом.

## 3. Подтверждённые разрывы, которые нужно закрыть первыми

### M01. Универсальные товары и авторские витрины — P0

**Сейчас.** [app/(main)/item/[id]/page.tsx](<../app/(main)/item/[id]/page.tsx>) обслуживает Spunkram, отправляет Gal на `/premiere-gal`, а остальных авторов перенаправляет через `motionflowItemPageUrl()` на Laravel `/item/{slug}/{id}`. В [proxy.ts](../proxy.ts) специальные host rewrites есть для `spunkramv2.motionflow.pro` и `premieregal.motionflow.pro`. Laravel продолжает иметь wildcard-профили авторов и slug-маршруты товаров.

**Перенести:** общую страницу товара для всех оставшихся авторов; описания в старых форматах HTML/Editor.js, атрибуты категории, превью, demo, внешние ссылки, цену, варианты лицензии, покупку и скачивание. Публичный профиль автора должен включать его каталог и нужные метаданные. Новые пути не обязаны повторять старые, но каждый сохраняемый старый URL должен иметь прямой рабочий маршрут или точный redirect.

**Готово, когда:** товар автора вне Gal/Spunkram открывается и покупается без PHP; старые `/item/{slug}/{id}` и авторские поддомены не возвращают 404 и не создают циклы. Отдельно согласовать `spunkram.motionflow.pro` и `spunkramv2.motionflow.pro`, wildcard-домены и профиль `enamalamin`.

**Источники:** [Laravel web routes](../../laravel/routes/web.php), [MarketplaceItemController](../../laravel/app/Http/Controllers/MarketplaceItemController.php), [MarketplaceProfileController](../../laravel/app/Http/Controllers/MarketplaceProfileController.php), [motionflow-urls.ts](../lib/motionflow-urls.ts).

### M02. Скачивание без Laravel fallback — P0

**Сейчас.** [GET /api/download/[itemId]](<../app/(main)/api/download/[itemId]/route.ts>) проверяет пользователя, подписку/покупку и лимит, пишет историю и пытается выдать R2 presigned URL. Если его не удалось создать, маршрут обращается к `/item/{slug}/{id}/download` через [motionflow-upstream-download.ts](../lib/motionflow-upstream-download.ts), используя переходные upstream cookies/headers/key.

**Перенести/завершить:** проверить все сохраняемые типы файлов и права, купленные товары, авторские подписки, бесплатные товары, demo/try-free и авторский `own_download`; обеспечить их выдачу из R2 либо другого самостоятельного хранилища. Найти файлы, доступные только через Laravel local disk и `/secure-dl/{id}`. Для недоступного объекта возвращать самостоятельную понятную ошибку, а не идти в PHP.

Согласовать правила доступа с [Laravel itemLinkAction](../../laravel/app/Http/Controllers/MarketplaceItemController.php): текущий gate Next.js нельзя считать эквивалентным всем старым веткам только из-за существования API. Проверить скрытые/заблокированные товары, флаг участия в подписке, права автора и соавтора, возвращённые покупки, лимиты и историю скачиваний.

Presigned URL подтверждает возможность подписать запрос, **но не наличие объекта**: [marketplace-r2-presign.ts](../lib/marketplace-r2-presign.ts) не проверяет объект через HEAD. Нужна инвентаризация ключей и контрольное скачивание.

**Готово, когда:** необходимые файлы существуют в нужных bucket/key, права проходят положительные и отрицательные проверки, а все сохраняемые download-сценарии работают при недоступном Laravel.

### M03. Полный цикл upload, обработки и публикации — P0

**Сейчас.** Next.js создаёт строку с `access = 0`, разрешает базовый PATCH и presigned PUT. [upload/sign](<../app/(main)/api/profile/upload/sign/route.ts>) выдаёт ключ `preview/{itemId}/{uuid}.{ext}` через `getR2Bucket()`, то есть `R2_PUBLIC_BUCKET`. [upload-item-file.ts](../components/author/upload-item-file.ts) использует этот же маршрут для слота `main` и сохраняет имя ZIP в `files.main`. Скачивание при этом ожидает `R2_BUCKET` и `secure/market/items/{itemId}/{main}.zip`.

**Конкретный разрыв:** загрузка ZIP через обычную авторскую форму не создаёт ожидаемый приватный объект для marketplace download; платный исходный архив направляется в публичный bucket. Это нужно исправить до использования формы как полной замены Laravel.

**Перенести:**

- Раздельные upload-пути для публичных превью и приватных архивов; server-side finalize с проверкой объекта, размера, типа и владения.
- Возобновление/многокомпонентную загрузку, если это требуется размерами реальных файлов; лимиты и уборку незавершённых загрузок.
- Производство ожидаемых image variants, видео/аудио-превью и watermark, либо новый согласованный формат медиа. Сейчас Laravel делает это в [Contributor](../../laravel/app/Http/Controllers/Contributor.php) и [CompressContent](../../laravel/app/Jobs/CompressContent.php).
- Поля категорий: версии AE/PR/DaVinci/FCPX, разрешение, плагины, аудио-параметры и остальные реально используемые атрибуты. Текущие draft/PATCH поддерживают только `works_with`, `os_compatibles`, `file_size`.
- Редактор описания и совместимость существующих описаний; варианты цены/лицензий, team/co-author, external/demo links, обновление версии и уведомление покупателей.
- Процесс состояний: черновик, обработка, отправка на проверку, одобрение/возврат/блокировка, публикация, обновление, удаление. Для новых товаров одного `access = 0` недостаточно.

Отдельная система [packages_projects](../lib/packages-projects.ts) и R2Sync уже помогает публикации паков расширений. Её можно использовать как основу, но она не заменяет автоматически marketplace-поля и старую медиа-обработку.

**Готово, когда:** новый и существующий товар можно полностью подготовить и выпустить через Next.js; приватный ZIP скачивается только после gate; медиа работают; неуспешная обработка восстанавливается без artisan.

### M04. Модерация и управление marketplace — P0

**Сейчас.** `/profile/items` показывает список, статусы и ссылку на Laravel-товар. Полный набор операций [AjaxController](../../laravel/app/Http/Controllers/AjaxController.php) и `/adminzone/items_access` в Next.js не найден. Новая админка пользователей не покрывает эти операции.

**Перенести:** очередь `approval_requires`, approve/soft reject/reject/block и объяснения, повторную отправку автором, редактирование администратором, удаление/архивирование, featured/ranking и участие в offer, а также статистику товара и доступ соавтора. Согласовать последствия удаления для старых покупок и файлов. Сохраняемые действия должны иметь server-side RBAC, проверку владельца и аудит.

**Готово, когда:** администратор принимает новый товар и обновление, автор исправляет замечания, опубликованный товар появляется в каталоге, а запрещённые операции не проходят прямым API-запросом.

### M05. Marketplace выплаты авторам — P0

**Сейчас.** Просмотр, реквизиты и инвойс выплаты есть в [author/payouts.ts](../lib/author/payouts.ts) и `/profile/payouts/*`. Но Laravel [Kernel](../../laravel/app/Console/Kernel.php) ежемесячно вызывает `mkpayout:init`; [InitMarketplacePayouts](../../laravel/app/Console/Commands/InitMarketplacePayouts.php) создаёт записи `payouts` из `users.balance`, учитывает минимальную сумму/реквизиты и при выполнении условий обнуляет баланс. Эквивалент в Next.js не найден.

**Перенести:** транзакционное формирование периода, резервирование/перенос баланса, минимальные суммы, snapshot реквизитов, список для администратора, подтверждение фактической оплаты, отмену с корректным возвратом резерва, extra corrections и историю.

Важные детали исходника:

- В текущем `mkpayout:init` распределение дохода по subscription downloads и bonus **закомментировано**; `subs_amount = 0`, сумма берётся из баланса. Формулу нужно согласовать, а не восстанавливать по названию таблицы или старому UI.
- Запуск `mkpayout:start` 15-го числа в scheduler **закомментирован**. В самой [StartMarketplacePayouts](../../laravel/app/Console/Commands/StartMarketplacePayouts.php) платёжный исполнитель оставлен как TODO и `$funcPayToAuthor = false`. Нельзя считать старую систему работающим автоматическим банковским переводом.
- Новые [affiliate payouts](../lib/affiliate/payouts.ts) относятся к другой программе и другим таблицам; они не заменяют `payouts` авторов.

**Готово, когда:** повторный и конкурентный запуск одного периода не создаёт дублей и не списывает баланс дважды; сценарии ниже порога/без реквизитов/возврата проверены; бухгалтерская сверка подтверждает суммы; есть назначенный исполнитель и реальное расписание Node-задачи.

### M06. Платежи и покупки всех сохраняемых товаров — P0

**Сейчас.** Paddle backend перенесён существенно: sale → `sold_items`, team/referral splits, авторские подписки и баланс, `subscription_payments`, refunds, GHL, новые affiliate commissions. Есть upgrade/downgrade. Checkout найден для Gal/Spunkram и новых тарифов. Общей старой корзины в Next.js не найдено.

**Необходимая работа:** проверить существующий порт и завершить universal checkout для M01. Согласовать, сохраняются ли многотоварная корзина, quantity, upgrade лицензии, покупка за `users.balance`, сохранённые методы и старые типы купонов из [CartController](../../laravel/app/Http/Controllers/CartController.php) и [PaymentService](../../laravel/app/Http/Abstracts/Payments/PaymentService.php). Если они больше не нужны, закрыть входы в эти сценарии и решить судьбу уже выданных купонов/балансов.

Для сохраняемых PayProGlobal/FastSpring событий нужен обработчик или явное завершение интеграции. Их классы есть в Laravel [PaymentProcessing](../../laravel/app/Http/Controllers/Checkout/PaymentProcessing.php); наличие кода не подтверждает активность аккаунтов. Stripe в этом switch является заглушкой, а не обнаруженной рабочей интеграцией.

**Проверить:**

- Повторные и запоздавшие webhook; идентификаторы buyer/item/author, лицензии, несколько строк покупки и разные Paddle accounts/secrets.
- Начальную покупку, продление, lifetime, upgrade, downgrade, pause/resume/cancel/past_due, полные и частичные возвраты с соответствующим финансовым результатом.
- Комиссии платформы/автора/соавтора/referral, валюту, rounding, баланс и payment ledger на реальных обезличенных примерах.
- Административный revoke доступа и возврат денег у провайдера как две отдельные операции: отзыв в локальной БД не прекращает внешнее списание.
- Обработку ошибок без потери события и возможность replay; [replay-paddle-events.mjs](../scripts/replay-paddle-events.mjs) и [replay-paddle-notifications.mjs](../scripts/replay-paddle-notifications.mjs) использовать после проверки их побочных эффектов на staging.

**Готово, когда:** все сохраняемые платёжные сценарии проходят приёмку; платёжные кабинеты направляют события в Next.js; одно событие не обрабатывают независимо оба приложения. URL `/webhook/{gateway}` перевести в совместимый handler либо заменить у отправителя; HTTP redirect для POST webhook не считать достаточной миграцией.

### M07. Персональные лицензии и документы покупок — P0

**Сейчас.** Кнопка в `/profile/purchases` использует [motionflowInvoiceUrl](../lib/motionflow-urls.ts) → `/item/{slug}/{id}/license?id={sold_items.id}`. Это Laravel [ItemManager::itemLicense](../../laravel/app/Http/Controllers/Contributor/ItemManager.php). `/license` в Next.js содержит общие условия использования и не является заменой.

**Перенести:** документ по конкретной покупке: покупатель, автор, реквизиты, дата, сумма, quantity, тип лицензии и purchase code; выбор документа при нескольких покупках одного товара; печать/выгрузку, если используется. Проверять, что `sold_items.id` принадлежит текущему покупателю. Совместимость старых ссылок нужна независимо от нового расположения страницы.

**Готово, когда:** старый покупатель получает правильный документ без PHP, а чужой идентификатор документа не раскрывает данные. Инвойсы выплат уже имеют отдельный Next.js маршрут — их не нужно переписывать вместе с лицензиями покупателя.

### M08. Заявки, поддержка и рабочие операции администратора — P0 для используемого процесса

**Сейчас.** `/api/contact` создаёт `request_messages`; уведомление в [contact-requests.ts](../lib/contact-requests.ts) по умолчанию содержит ссылку на `authors.motionflow.com/adminzone/requests`. Laravel [Admin/Requests](../../laravel/app/Http/Controllers/Admin/Requests.php) предоставляет список, назначение сотрудника, ответ, close/reopen, рассмотрение author/affiliate requests и refund actions. Соответствующий полноценный кабинет в Next.js не найден.

**Перенести или заменить сервисом поддержки:** чтение входящих обращений/вложений, статусы, назначение ответственного, ответ пользователю, решение заявки автора/партнёра, связку с покупкой и безопасный refund flow. Новая CEP форма support report не заменяет всю историю обычных обращений.

**Готово, когда:** отправленная из Next.js заявка обрабатывается до закрытия без Laravel; старые незакрытые обращения доступны; ссылки в уведомлениях ведут в действующий кабинет.

## 4. Остальной функционал, который нужно перенести или явно закрыть

| ID / приоритет | Что осталось | Почему это не считается перенесённым | Результат задачи |
|---|---|---|---|
| M09 / P1 | Coupons, offers, author marketing | Нет `/profile/marketing/*` и соответствующей coupon CRUD; Laravel содержит `/marketing`, `/adminzone/coupons`, `/adminzone/offers`, `/offer/{slug}` | CRUD/включение/сроки/применение/статистика скидок либо согласованная замена на Paddle discounts; старые условия купонов обработаны |
| M10 / P0 при активных referrals | Старые `/l/*` и affiliate attribution | Next.js `/l/[link]` читает только `redirect`; Laravel также увеличивает views, добавляет UTM, сохраняет ad tracker и cookie `ref` | Перенести старый контракт или сопоставить ссылки с новой программой; комиссии не теряются и не начисляются дважды |
| M11 / P0 для действующих ссылок, P1 для редактора | Рассылки и уведомления покупателей | Нет `/mailing/unsubscribe`, `/mailing/click`, полноценной панели кампаний и product-update pipeline | Рабочая отписка из старых писем, tracking/redirect, consent, batches/retry, журнал отправки; завершены старые очереди |
| M12 / P1 | Help Center | Laravel `help.*`: главная, поиск, статьи/категории, get-support, CMS `/adminzone/help_center` | Перенос содержимого/URL/редактора или новая база знаний с точными redirect; обращения не теряются |
| M13 / P1 | Tutorials и локализации | Laravel `tuts.*`: поиск, статьи, профили, языковые варианты, CMS `/adminzone/tutorials` | Публикация и импорт контента с изображениями, canonical/локалями; сохранение востребованных URL |
| M14 / P1 | Public author profiles и расширенные настройки пользователя | Старые profile/settings содержат avatar, social networks, personal/company/address fields; Next.js profile PATCH покрывает name/email/password | Данные для публичной страницы и документов редактируются; остальные поля перенесены либо явно сняты с использования |
| M15 / P2 | Following, badges, notifications, rating | `/following` и `/notifications` перенаправлены на `/profile`, что не воспроизводит функциональность; рейтинги читаются в legacy API, но write-flow не найден | Осознанное решение по каждой функции, миграция данных и UI либо закрытие входов; не считать redirect функциональной заменой |
| M16 / P1 | Настройки платформы и служебные отчёты | Laravel `/adminzone/page_settings`, `/control`, `/analytics`, `/search`, `/investment`; Next.js читает часть `page_settings`, но не заменяет всю панель | Сохраняемые бизнес-флаги/отчёты доступны; старые maintenance/test инструменты не переносить без потребности |
| M17 / P0 | Auth cutover и старые клиентские контракты | Session bridge, старые auth URL и уже установленные внешние клиенты могут пережить переключение UI | Автономный login/доступ во всех нужных доменах, совместимость старых ссылок/SDK, понятный переход существующих сессий |
| M18 / P0 | Данные, фоновые процессы, routing и отключение PHP | Локальные исходники не показывают фактические cron/nginx/queue/webhook настройки | Полный runtime inventory, воспроизводимый deploy, резервная копия, staging без PHP, cutover и rollback |
| M19 / P1 | SEO и старые URL | Next sitemap сейчас содержит статический набор страниц; Laravel генерирует marketplace/help/tutorial sitemap | Полная карта URL, динамические sitemap, метаданные и redirect без массовой потери страниц |

### M09. Маркетинг и скидки

Источники: [Contributor/Marketing](../../laravel/app/Http/Controllers/Contributor/Marketing.php), [Admin/Offer](../../laravel/app/Http/Controllers/Admin/Offer.php), [couponService](../../laravel/app/Models/couponService.php), [offerPages](../../laravel/app/Models/offerPages.php).

Нужно согласовать три разных сценария: скидка на товар, купон корзины и offer-страница с подборкой. Проверить scope автора/товара, сроки, включение/выключение, ограничения использования и типы `percent`, `value`, `fixed`. Поля скидок в Product и специальная Gal скидка сами по себе не заменяют редактор и применение прежних купонов. Search queries и update notifications имеют собственные отчёты и таблицы; их переносить вместе с механизмом записи новых событий, а не только чтением исторических строк.

### M10. Две партнёрские программы

Старая система использует `short_links`, `sold_items.ref_link_id/ref_author_id/ref_earn` и cookie `ref`. Laravel short-link handler ставит её для гостя с правилами приоритета и сроком 5 дней. Новая система использует `affiliates`, комиссии/выплаты/кампании и `mf_aff_ref` с last-click окном 30 дней. Это разные правила атрибуции, а не переименование таблиц.

Источники: [Laravel ShortLinksController](../../laravel/app/Http/Controllers/Responsible/ShortLinksController.php), [Next /l/[link]](<../app/(main)/(app)/l/[link]/page.tsx>), [affiliate/shared.ts](../lib/affiliate/shared.ts), [affiliate/commission.ts](../lib/affiliate/commission.ts), [первичная миграция новой программы](../db/migrations/2026_09_13_affiliates.sql).

Нужна явная таблица соответствия старый link/partner → новый partner/campaign или решение сохранить прежнюю схему до завершения обязательств. Отдельно сверить исторические начисления и активные ссылки в рекламе/видео. Простое перенаправление URL сохраняет переход, но теряет старые UTM/cookie/view semantics.

### M11. Письма, отписка и очереди

В Next.js уже есть transactional mailers и специальный [send-campaign-queued.mjs](../scripts/send-campaign-queued.mjs). Этот скрипт одной кампании не доказывает перенос Laravel [Admin/MailingMarketing](../../laravel/app/Http/Controllers/Admin/MailingMarketing.php), [Automation/Mailing](../../laravel/app/Http/Controllers/Automation/Mailing.php), `mailingMarketing` и `notifyItemUpdate`.

Сохранить отписку пользователей и guest emails, запреты отправки, click URLs, product-update opt-in (`sold_items.update_notify`) и журнал результатов. Существующие unsubscribe URL подписаны Laravel — новый формат токена не сможет автоматически проверить старую подпись. Нужен переходный verifier либо другой совместимый способ обработать уже разосланные ссылки. Поддержка старой подписи может временно требовать сохранения `APP_KEY` даже после остановки PHP.

Учесть стартовый promo bonus из [Automation/Notifies](../../laravel/app/Http/Controllers/Automation/Notifies.php) и уведомления team/badge, если эти сценарии сохраняются. Механизм bonus из Laravel регистрации нельзя считать перенесённым только из-за работающего Next.js register.

## 5. Авторизация, API и внешние зависимости

### Авторизация без общего Laravel runtime

Next.js сначала проверяет JWT cookie `next_motionflow_session`, затем читает Laravel cookie **`motionflow_session`** и PHP session payload из Redis. Некоторые login/verify/Google/logout пути создают или удаляют обе сессии. Bridge реализован самостоятельно в [laravel-session.ts](../lib/auth/laravel-session.ts): наличие этого файла не означает HTTP-вызов Laravel, но сохраняет зависимость от его ключа, формата и Redis namespace.

Задачи M17:

- [ ] Проверить login со старыми password hashes и Google accounts; не пересоздавать пользователей и не менять их ID.
- [ ] Выбрать переход: обмен действующей legacy session на Next session до её истечения либо повторный вход. Проверить logout и срок действия cookie на apex и нужных поддоменах.
- [ ] Настроить самостоятельный `AUTH_SECRET`: [session.ts](../lib/auth/session.ts) сейчас может использовать `APP_KEY` как fallback. Не менять signing secret без плана для действующих JWT.
- [ ] Сохранить Redis для CEP, presence и rate limits; удаление Laravel bridge не означает, что Redis больше не нужен.
- [ ] Проверить old email verification/password reset URLs и токены. При невозможности совместимости предоставить рабочий resend/reset flow.
- [ ] Свести RBAC и исключения: buyer 0, partner 1+, author 2+, investor 50, admin 100. Laravel investor-доступ и специальные allowlist в новых modules требуют отдельного сопоставления.
- [ ] Проверить API mutations напрямую: server-side auth/ownership, ограничения частоты, обработку cookie/CSRF и CORS. Это обязательная приёмка переносимых операций, а не основание менять все существующие API в рамках этого гайда.
- [ ] После миграции доменов/клиентов прекратить выпуск Laravel cookie; позднее удалить bridge и его env. `APP_KEY` сохранять до завершения всех подписанных legacy ссылок, которые решено поддерживать.

### Старые публичные API

Исходный список: [Laravel api.php](../../laravel/routes/api.php). В Next.js найдены аналоги перечисленных там API, включая `mf_subscription/check` и `recheck`. Наличие `/api/user` не доказывает совместимость `auth:sanctum`: старый маршрут использует Sanctum, а Next.js обработчик — web session. Если есть клиенты с `personal_access_tokens`, им нужен совместимый путь либо обновление auth.

Для каждого реально используемого клиента зафиксировать домен, method, path, auth, request/response fixtures, статусы и поддерживаемую версию. Проверить item verify/earnings/sales/details и подписочную проверку с теми headers и кодами, которые использует клиент. Сохраняемый API лучше обслуживать прямо, чем перенаправлять на новый URL с риском потери body/auth.

### AtomX и другие внешние системы

[GET /api/get-package-version](<../app/(main)/api/get-package-version/route.ts>) уже перенесён в Next.js, но всё ещё вызывает `https://api.get-atomx.com/atomx/v1/mau`. Это **внешняя AtomX-зависимость**, а не вызов соседнего Laravel. Отключение Laravel и отключение AtomX должны иметь разные критерии готовности. Если версия должна стать автономной, перевести клиентов на DB/R2 manifests и новый update API, затем убрать MAU fallback.

CEP market/download уже реализованы на новой системе packages. Проверить каждого клиента и автора, а также соответствие `marketplace_item_id` и package ID. [packages-download.ts](../lib/packages-download.ts) умеет выдавать публичный CDN, сохранённый `downloadUrl` или private presign — нужно проверить реальные значения данных, поскольку произвольный старый URL может оставаться runtime-зависимостью даже после переноса самого обработчика.

GHL forwarding уже есть в [ghl-forwarder.ts](../lib/ghl-forwarder.ts), но включается настройками. Подтвердить доставку нужных событий и поведение при ошибках, а также переключить Telegram/support links. Не переносить интеграцию заново только из-за её Laravel-имени.

## 6. Данные и фоновые процессы

### Что сохранить в базе

| Группа | Таблицы / данные | Действие до отключения |
|---|---|---|
| Доступ и деньги | `users`, `marketplace_items`, `sold_items`, `subscription_systems`, `subscription_payments`, `subscription_downloads`, `payouts` | Сохранить ID, связи и статусы; сверить суммы/балансы/права до и после переключения |
| Старые referrals и маркетинг | `short_links`, `coupon_services`, `offer_pages`, `free_download_emails`, `mailing_marketings`, `mailing_updates_notifies`, `mailing_analytics`, `search_query_stats` | Решить миграцию/архивирование; перенести активные обязательства, consent и источники событий |
| Контент и обращения | `help_center_articles`, `help_center_categories`, `tutorial_items`, `articles_locales`, `request_messages` | Сохранить содержимое, slugs, локали, медиа, вложения и незакрытые заявки |
| Управление и community | `page_settings`, `approval_requires`, `notifications`, `user_followings`, `item_ratings`, `item_popularities`, `views_counters`, `clicks_counters`, `invest_analyses`, `user_favorites` | Подтвердить используемые поля и политики; архивировать снятые функции, не удалять данные автоматически |
| Переходная инфраструктура | `password_resets`, `personal_access_tokens`, `failed_jobs`, Redis session/queue keys | Проверить активных потребителей и незавершённые задания; не очищать общие namespaces целиком |
| Новые данные Next.js | SQL из [db/migrations](../db/migrations), `packages_authors`, `packages_projects`, CEP/affiliate/generation/audit tables | Сверить фактическую production schema и сделать воспроизводимое развёртывание |

Laravel migrations не являются гарантированным полным снимком существующей базы. В Next.js также встречаются `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE` при первом запросе, например в [packages-authors-db.ts](../lib/packages-authors-db.ts) и [affiliate/db.ts](../lib/affiliate/db.ts). Нужно собрать схему, которая разворачивается без запуска Laravel и без случайного первого вызова нужного API. Проверить unique indexes, nullable fields и timezone/денежные типы, на которые рассчитывают обработчики.

В [RewriteConfigTrait](../../laravel/app/Traits/RewriteConfigTrait.php) настройки могут переопределяться через `page_settings`; конфиг PHP сам по себе не отражает итоговые production значения. Сверить рабочие business flags, цены/лицензии, доли, категории и правила публикации с БД. Переносить настройки и контракт, а не весь config-файл вместе с историческими параметрами.

### Какие процессы заменить

| Laravel процесс | Что делает в исходниках | Замена / обязательная проверка |
|---|---|---|
| `sitemap:generate` daily | Marketplace, Help, Tutorials sitemap | Динамическая генерация/кэш на Next.js; проверить выдачу старых sitemap URL |
| `mkpayout:init` monthly | Создание выплат и изменение баланса | Node job/worker с транзакцией и уникальным периодом; сначала сверка в dry-run |
| `mkpayout:start` | В scheduler отключён, executor TODO | Выбрать реальный ручной/платёжный процесс; не включать механически |
| `compressor`, `CompressContent` | Обработка медиа и смена статуса товара | Node/отдельный media worker, ограничение параллельности, retries и восстановление |
| `qm-buyers-notify` | Рассылка покупателям об обновлении | Очередь отправки и журнал результата; drain/контролируемый перенос старых заданий |
| Marketing/team/badge notifications | Emails и database notifications | Перенести только сохраняемые события; обеспечить согласие и отсутствие повторов |
| `compressor:retry-stuck`, `queue:retry-notify-batches` | Восстановление stuck/failed jobs | Новые операции поддержки и документация; проверить оставшиеся `access = -10` |

Источник очередей: [Laravel queue runbook](../../laravel/docs/queue-supervisor-tries.md), [Jobs](../../laravel/app/Jobs), [Notifications](../../laravel/app/Notifications). В [ecosystem.config.cjs](../ecosystem.config.cjs) описан web-процесс, а не замена всех этих cron/queue workers. Фактические задания на сервере нужно инвентаризировать отдельно.

Сериализованные Laravel jobs нельзя просто передать Node worker: он не исполняет PHP job payload. Нужен drain старых очередей или явное извлечение бизнес-задач с новыми идентификаторами и защитой от повторов.

## 7. URL, поддомены и SEO

Составить полный реестр по [web.php](../../laravel/routes/web.php), [api.php](../../laravel/routes/api.php), данным и access logs. Ниже — обязательные группы; конкретные значения slugs брать из БД и трафика.

| Старый адрес | Целевое поведение |
|---|---|
| `/item/{slug}/{id}` и action suffixes | Общая Next.js карточка; действия download/demo/license/edit/stats обслуживать отдельными защищёнными маршрутами |
| `/profile/{username}`, `{username}.motionflow.pro` | Публичный профиль/витрина автора, без конфликта с приватным `/profile/*` |
| `authors.motionflow.pro`, `/adminzone/*` | Новая админка/кабинет с точным mapping; сменить ссылки в header/sidebar/Telegram |
| `/dashboard`, `/my_items`, `/upload/*`, `/earnings/*`, `/payouts/*` | Соответствующий `/profile/*`, сохраняя params и нужные операции |
| `/affiliate/*`, `/marketing/*`, `/offer/*`, `/l/*` | Согласованный маркетинг/партнёрский контракт или явное завершение |
| `/my_purchases`, `/my_subscription`, `/my_downloads`, `/favorites` | Redirect уже есть; проверить результат и query parameters |
| `/following`, `/notifications`, `/settings/{section?}`, `/badges` | Перенос нужного сценария либо явное снятие; redirect на профиль не равен переносу |
| `/legal/terms-of-service`, `/legal/privacy-policy`, `/legal/refund-policy` | `/terms`, `/privacy`, `/refund`; сверить текст и обеспечить redirect |
| `/sign`, `/auth/*`, `/password/*`, `/email/*`, `/re-token` | Совместимость форм/старых писем/клиентов либо новый явный flow; не делать слепые redirects POST |
| `/webhook/*`, `/ajax/*`, `/secure-dl/*`, `/send-email` | Инвентаризация потребителей; заменить сохраняемые операции, остальные закрыть осознанно |
| `/cart` и checkout steps | Сохраняемая корзина либо прямой checkout с обработкой старых входных ссылок и купонов |
| `/mailing/unsubscribe`, `/mailing/click` | Рабочие handlers старых писем |
| `help.motionflow.pro`, `tuts.motionflow.pro` | Перенос контента или новый сервис с точными redirects |
| `atomx.motionflow.pro` | Решение по лендингу/продукту; в web.php активна главная, остальные AtomX страницы закомментированы |
| Gal/Spunkram домены, CDN, старые installer/demo ссылки | Проверка vhosts, rewrite, media, OAuth redirect и клиентов |

`next.config.mjs` уже содержит часть redirects, но не всю эту карту. В `proxy.ts` нет общей замены wildcard Laravel-профилей.

[app/sitemap.ts](../app/sitemap.ts) сейчас перечисляет статические страницы и не генерирует все товары/авторов/статьи. Laravel [SitemapGenerate](../../laravel/app/Http/Controllers/SitemapGenerate.php) создаёт sitemap по данным marketplace/help/tutorials. До отключения нужно сохранить покрытие опубликованных страниц, действительные canonical, metadata, нужные structured data и корректные 404/410. [robots.txt](../public/robots.txt) закрывает `/profile/`; публичный профиль автора, если он остаётся в этом namespace, требует отдельного решения по индексации.

## 8. Рекомендуемый порядок работ

### Этап A. Подтвердить границы миграции

1. Снять production inventory доменов, nginx locations, webhooks, cron, workers, queues, локальных файлов и интеграций. Не менять production на этом шаге.
2. Для M09–M16 и старых платёжных способов выбрать: переносим / заменяем / закрываем. Зафиксировать активные URL, клиентов и обязательства.
3. Сверить схему, индексы, config overrides и R2 keys; сделать восстанавливаемый backup БД/локальных файлов и manifest объектов.
4. Зафиксировать приёмочные fixtures: покупатели, авторы, соавторы, старые покупки/подписки/купоны/ссылки и опубликованные товары.

### Этап B. Убрать зависимость критических операций

1. M03 + M04: private upload, media worker, moderation и публикация.
2. M01 + M06: универсальная карточка/авторская витрина и checkout для сохраняемого каталога.
3. M02 + M07: полностью самостоятельные скачивания и документы покупок.
4. M05: marketplace payout job и административное закрытие периода.
5. M08: законченный цикл поддержки/заявок.

### Этап C. Закрыть оставшиеся продукты и контракты

1. M09–M16: маркетинг, старые referrals, письма, контент и операционные настройки согласно решениям этапа A.
2. M17: сессии, старые токены/письма, публичные API и установленные клиенты.
3. M19: URL registry, sitemap, поддомены и SEO.

### Этап D. Доказать автономность и переключить инфраструктуру

1. На staging развернуть Next.js/Node workers с копией нужной схемы и тестовыми данными; Laravel должен быть недоступен для всех проверяемых путей.
2. Прогнать приёмку ниже, сверить финансы и права. Не считать отключение fallback только env-переключателем доказательством переноса.
3. Подготовить точные изменения nginx/DNS, webhook destinations и cron/queue конфигурации. Каждый бизнес-сценарий должен иметь одного владельца записи.
4. Переключить согласованное окно; прекратить новые Laravel jobs; завершить старые очереди; переключить payout/media/mail scheduling.
5. Держать Laravel checkout и конфигурацию для контролируемого rollback. Откат должен возвращать трафик и владельцев задач, сохраняя новые записи и не повторяя денежные начисления.
6. После согласованного периода наблюдения без обращений к PHP отключить PHP-FPM, artisan schedules и workers для этого сайта. Только после отдельной проверки убрать legacy session env, local files и PHP deployments; не удалять общую БД/R2/Redis.

## 9. Приёмка перед отключением Laravel

| Сценарий | Что должно быть доказано |
|---|---|
| Старый пользователь и новый пользователь | Login/password reset/verify/Google/logout работают; ID и доступ сохранены; нужные поддомены не теряют сессию |
| Покупка товара любого сохраняемого автора | Checkout → webhook → ровно один финансовый результат → purchase → download → персональная лицензия без PHP |
| Подписка | Начало, продление, lifetime, upgrade/downgrade, cancel/pause/resume/past_due и границы срока дают согласованные доступ и начисления |
| Возврат | Полный/частичный refund отражается в доступе, sold/subscription ledger, балансах и referrals по выбранным правилам; повтор безопасен |
| Скачивание | Purchased/subscription/free/demo/author cases; no-access/blocked/refunded cases; лимит, история, TTL и существование R2 объекта |
| Публикация | Новый и обновляемый товар проходят upload → processing → moderation → storefront → download; worker failure восстанавливается |
| Выплаты | Порог, реквизиты, период, повтор/конкуренция, подтверждение/отмена, документы и сверка баланса |
| Партнёрские ссылки | Старые `/l/*` и новые `?ref=` сохраняют согласованную атрибуцию/UTM и правильные комиссии |
| Поддержка и письма | Contact/support → обработка → ответ/закрытие; update notifications; отписка из старого письма исключает дальнейшую отправку |
| Внешние клиенты | Реальные версии CEP/Odin/инсталляторов и старые API fixtures проходят auth/catalog/version/verify/download |
| Контент/SEO | Старые товары/авторы/help/tutorial URL имеют осмысленный ответ; sitemap соответствует опубликованным страницам; нет циклов |
| Инфраструктура | Всё выше выполнено при недоступном PHP; production destinations подтверждены; есть monitoring и проверенный rollback |

### Финальный список готовности

- [ ] У всех M01–M19 есть решение, ответственный и результат приёмки; закрытые функции имеют согласованное обращение со старыми URL/данными.
- [ ] Нет необходимых переходов на Laravel из UI, уведомлений, сохранённых DB URLs и клиентских конфигов.
- [ ] Нет Laravel HTTP fallback в сохраняемых runtime-путях; legacy compatibility код учтён отдельно.
- [ ] Webhooks и денежные jobs имеют одного активного владельца; суммы и права сверены.
- [ ] Marketplace publishing и media/mail workers выполняются без artisan.
- [ ] Формирование выплат не зависит от Laravel scheduler.
- [ ] Персональные лицензии, старые unsubscribe links и оставленные публичные API работают без PHP.
- [ ] Все сохраняемые файлы, приложения и контент доступны из новых storage/routes.
- [ ] Развёртывание с нуля не требует запуска Laravel migrations или первого случайного пользовательского запроса для создания схемы.
- [ ] nginx/vhosts/DNS и third-party destinations проверены на сервере; зафиксирован rollback.
- [ ] После переключения нет необъяснённых 404/5xx, потерянных очередей, расхождений начислений и обращений к PHP на согласованном периоде наблюдения.

**Первый практический пакет разработки:** M03–M04 (публикация), M01/M02/M07 (все товары, скачивания и лицензии), M05 (выплаты), M08 (заявки) и приёмка уже существующего M06 (Paddle). Это закрывает основные подтверждённые операционные зависимости. Полное отключение требует также завершения решений и переключения из остальных разделов.
