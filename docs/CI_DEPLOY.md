# Motion Flow: сборка в GitHub Actions

Push в `main` запускает **Motion Flow build and deploy**. Для ручного обновления:

```bash
gh workflow run release.yml -R nipapin/motionflow --ref main -f deploy=true
```

На компьютере с авторизованным GitHub CLI также можно выполнить `npm run deploy`.
В интерфейсе GitHub: **Actions → Motion Flow build and deploy → Run workflow**,
ветка `main`, параметр `deploy=true`.

CI на Ubuntu x64 с Node 20.20.2 устанавливает зависимости, собирает Next,
удаляет devDependencies и упаковывает готовый runtime. Сохраняется собственный
`server.mjs` с `/api/cep/ws`; он проверяется запуском упакованного приложения
и настоящим WebSocket handshake. Next standalone не используется, поскольку
он не трассирует пользовательский сервер. Нативные зависимости собираются на Linux.

VPS получает архив с checksum, распаковывает отдельный релиз и пересоздаёт
только PM2-процесс `motionflow`. Проверка `/api/deploy-health` требует именно
новый release ID, MySQL и Redis. При ошибке запуска installer возвращает прежний
релиз, включая первоначальный запуск из старого checkout. Перезапуск в fork-режиме
занимает короткую паузу; WebSocket-клиенты переподключаются.

На VPS не выполняются `git pull`, `npm ci` и `next build`. Production `.env`
остаётся в `/var/www/motionflow_p_usr/data/www/next.motionflow.pro/.env`; каждый
релиз использует ссылку на него. Секреты не попадают в архив или CI. Публичные
`NEXT_PUBLIC_*` из старого `.env` хранятся в GitHub variable `BUILD_PUBLIC_ENV`
в формате JSON; после изменения этих значений требуется новая сборка.
Сборка использует недействующие локальные DB/Redis-настройки и не обращается
к production-сервисам. Миграции автоматически не запускаются — как и прежде.
`.cache/audio-peaks` сохраняется в `/root/motionflow-deploy/shared/cache`.

## Telegram

Существующий PM2-процесс `webhook-receiver` продолжает обслуживать Telegram,
команды `/start`/`stop` и список подписчиков. CI вызывает
`/root/motionflow-ci/notify-server.mjs` по SSH; скрипт читает конфигурацию
и подписчиков самого webhook. Токен бота остаётся на VPS.
Уведомления отправляются о начале сборки, успехе, ошибке, отмене и сборке
без деплоя. Завершение сообщает отдельный workflow, поэтому отмена сборки
также обрабатывается. PR не получает SSH-ключ и не рассылает уведомлений.
Ошибки доставки видны в Actions; они не блокируют обновление приложения.

GitHub push-hook `https://webhook.motionflow.pro/webhook` для репозитория
`nipapin/motionflow` выключен через `active=false`, чтобы не запускать
параллельную сборку на VPS. Telegram webhook остаётся действующим.

## Настройки и проверка

GitHub repository secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`. Используется отдельный SSH-ключ с запретом forwarding
и PTY. GitHub variables: `BUILD_PUBLIC_ENV`, `DEPLOY_ENABLED=true`.
Environment: `production`. `DEPLOY_ENABLED=false` отключает только выкладку.
PR и ручной запуск с `deploy=false` сохраняют готовый архив в Actions.

```bash
ssh motionflow 'curl --fail http://127.0.0.1:3000/api/deploy-health'
ssh motionflow 'pm2 describe motionflow'
```

Каталоги `/root/motionflow-deploy/releases/<sha>-<run>-<attempt>` и
`incoming/<sha>-<run>-<attempt>` содержат распакованные релизы и архивы.
`current` указывает на рабочий релиз, `previous` — на предыдущий успешный.
Оставляются три свежих релиза плюс цели `current`/`previous`. Старый checkout
не удаляется. Повторный запуск выполняйте через **Re-run all jobs**, чтобы
получить новый ID попытки. `flock` предотвращает параллельную установку.

Ручной откат к предыдущему CI-релизу:

```bash
ssh motionflow 'flock -n /root/motionflow-deploy/deploy.lock bash -c '\''
set -e
root=/root/motionflow-deploy
previous=$(readlink -f "$root/previous")
test -f "$previous/ecosystem.release.cjs"
ln -s "$previous" "$root/.manual-rollback"
mv -Tf "$root/.manual-rollback" "$root/current"
pm2 delete motionflow
pm2 start "$previous/ecosystem.release.cjs" --only motionflow
pm2 save
'\'''
```

Источники: [Next custom server](https://nextjs.org/docs/app/guides/custom-server),
[GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data).
