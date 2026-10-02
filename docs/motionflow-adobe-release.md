# Motion Flow Adobe CEP backend and releases

Клиент: `motionflow-adobe`, marketplace author 6, platformSubscription=true.
Browser login: `/cep/login`. Creator открывает библиотеку/стили; Creator+AI и
дополнительные кредиты используют общую квоту сайта. Captions и Chapters
проходят через существующие API; Chapters используют receipt транскрипции.
Spunkram/Gal/Odin сохраняют собственные квоты и release streams.

## Деплой и публикация

1. Выполнить `node --test scripts/test-motionflow-adobe.mjs scripts/test-cep-releases.mjs`
   и `npm run build`; задеплоить этот commit обычным способом сайта.
   После деплоя `/api/cep/auth/device` должен принимать `client=motionflow-adobe`.
2. Собрать CEP на Windows: `npm ci`, `npm run installer`, `npm test`.
   Installer EXE устанавливает панель и FFmpeg; unsigned ZIP содержит только
   CEP payload для in-panel update. Версия package.json и manifest совпадает.
3. Проверить SHA-256 ZIP и опубликовать отдельный stream:

   ```powershell
   node --env-file=.env scripts/upload-spunkram-zxp.mjs --product=motionflow --zxp=../CEP/motionflow-cep/dist/MotionFlow-Adobe-CEP-unsigned.zip --version=0.2.0 --dry-run
   ```

   Затем повторить без `--dry-run`. Скрипт использует существующие R2 env;
   секреты не передаются в git. Ключи: `public/downloads/motionflow/<version>/motionflow.zip`,
   `public/downloads/motionflow/latest.json` (stable) или `beta.json`.
   SHA-256 вычисляется по фактическому архиву и входит в manifest.
4. Альтернатива: GitHub Release с тегом `motionflow-0.2.0` и asset
   `MotionFlow-Adobe-CEP-unsigned.zip`. CEP Windows workflow создаёт assets.
   Подключить существующий `/api/github/webhook` с `GITHUB_WEBHOOK_SECRET`
   к `motionflowdesign-jpg/motionflow-adobe-cep`, событие Releases.
   Dedicated repo разрешён вместе с `GITHUB_SPUNKRAM_REPO`, но может
   публиковать только product=motionflow. Webhook проверяет подпись.
5. `/api/cep/update` и `/api/cep/update/download` определяют product по токену,
   не по query. Download проверяет requested version и возвращает HTTPS redirect
   на asset текущего release. Token не пересылается на CDN. CEP проверяет SHA,
   product, bundle/version до изменения файлов. Первая установка требует EXE;
   updater не устанавливает/обновляет FFmpeg.

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
