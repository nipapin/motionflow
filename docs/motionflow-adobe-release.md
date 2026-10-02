# Motion Flow Adobe CEP backend and releases

Клиент: `motionflow-adobe`, marketplace author 6, platformSubscription=true.
Browser login: `/cep/login`. Creator открывает библиотеку/стили; Creator+AI и
дополнительные кредиты используют общую квоту сайта. Captions и Chapters
проходят через существующие API; Chapters используют receipt транскрипции.
Spunkram/Gal/Odin сохраняют собственные квоты и release streams.

## Деплой и публикация

1. Выполнить `node --test scripts/test-motionflow-adobe.mjs scripts/test-cep-releases.mjs scripts/test-motionflow-installer.mjs`
   и `npm run build`; задеплоить этот commit обычным способом сайта.
   После деплоя `/api/cep/auth/device` должен принимать `client=motionflow-adobe`.
2. Собрать CEP на Windows: `npm ci`, `npm run installer`, `npm test`.
   Go Installer EXE (~6.9 МиБ) скачивает панель и FFmpeg через BE; unsigned ZIP содержит только
   CEP payload для in-panel update. Версия package.json и manifest совпадает.
3. Проверить SHA-256 ZIP и опубликовать отдельный stream:

   ```powershell
   node --env-file=.env scripts/publish-motionflow-installer.mjs --version=0.3.0 --zip=../CEP/motionflow-cep/dist/MotionFlow-Adobe-CEP-unsigned.zip --ffmpeg=../CEP/motionflow-cep/dist/ffmpeg.exe --setup=../CEP/motionflow-cep/dist/MotionFlow-Setup-0.3.0.exe --dry-run
   ```

   Затем повторить без `--dry-run`. Скрипт использует существующие R2 env;
   секреты не передаются в git. Сначала публикует immutable CEP ZIP, сжатый
   FFmpeg с ключом по SHA-256 распакованного EXE и маленький Setup EXE.
   Проверяет pinned FFmpeg, размер и SHA-256 существующих объектов, отказывается
   заменять выпущенную версию другим содержимым. После успешной загрузки
   переключает `public/downloads/motionflow/installer/latest.json` и
   `public/downloads/motionflow/latest.json`. ZIP остаётся совместимым с updater.
   `--dry-run` только рассчитывает manifest и ничего не публикует.
4. GitHub Release с тегом `motionflow-0.3.0` и asset
   `MotionFlow-Adobe-CEP-unsigned.zip`. CEP Windows workflow создаёт assets.
   Подключить существующий `/api/github/webhook` с `GITHUB_WEBHOOK_SECRET`
   к `motionflowdesign-jpg/motionflow-adobe-cep`, событие Releases.
   Dedicated repo разрешён вместе с `GITHUB_SPUNKRAM_REPO`, но может
   публиковать только product=motionflow. Webhook проверяет подпись.
   Этот webhook обновляет только CEP stream: для онлайн-установщика нужен
   publish-motionflow-installer.mjs, который публикует все три файла.
5. `/api/cep/update` и `/api/cep/update/download` определяют product по токену,
   не по query. Download проверяет requested version и возвращает HTTPS redirect
   на asset текущего release. Token не пересылается на CDN. CEP проверяет SHA,
   product, bundle/version до изменения файлов. Первая установка требует EXE;
   updater не устанавливает/обновляет FFmpeg.

## Онлайн-установщик Windows

`GET /api/cep/installer` — публичный manifest schema=1 с product, version,
assets (cep, ffmpeg), byte lengths и SHA-256, а также ссылкой на Setup.
`GET /api/cep/installer/download?asset=cep|ffmpeg&version=x.y.z` передаёт
байты из R2 через BE; чужой asset=400, сменившаяся версия=409,
отсутствующий релиз=404, ошибка storage=503. Не принимает произвольные
storage keys/URL. `GET /api/cep/installer/setup` скачивает текущий EXE.
Токен не нужен для установки публичного ПО; paid assets и AI продолжают
использовать существующую авторизацию. Setup проверяет размеры, SHA-256
скачанного ZIP/GZIP и распакованного FFmpeg, bundle ID/version и ZIP paths
до замены live files. Подписанное приложение Adobe должно быть закрыто.

WebView2 Runtime — предпосылка графического режима, браузер и payloads
в EXE не встроены. На машине без Runtime доступен `--quiet`, либо сначала
нужно установить Microsoft Evergreen Runtime. Сам Runtime не является
частью CEP release. Панель сохраняет подпись/unsigned-статус исходного ZIP;
текущая сборка unsigned, debug mode включается только с согласия пользователя.

## Acceptance

После production-деплоя проверить device login/revoke, общий счётчик AI,
доступ к caption styles и обновление между двумя открытыми Adobe хостами.
В новом релизе использовать новую версию: повторная запись ZIP той же версии
под immutable URL не должна заменять выпущенный архив. Для rollback выпустить
новую версию с исправлением или переустановить сохранённый Setup локально.
macOS installer: план находится в CEP `docs/macos-installer-plan.md`.

Локальная сборка не подтверждает production-деплой. Публикация R2 и настройка
webhook выполняются отдельно от git push; не объявлять их успешными без
проверки ответа production и manifest CDN.
