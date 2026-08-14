# Captions Catalog API

Документация для клиентской части. Источник данных — публичный R2-бакет (`R2_PUBLIC_BUCKET`, тот же, что и `lib/r2-storage.ts`). Каждый продукт («бренд») читает свой префикс ключей в одном бакете; на момент миграции оба префикса содержат одинаковые файлы (см. `scripts/migrate-captions-to-r2.mjs`).

## Бренды каталога

| `brand` | R2-префикс |
|---------|------------|
| `gal` (по умолчанию) | `Gal Captions/` |
| `spunkram` | `Spunkram Captions/` |

`brand` передаётся как query-параметр (`GET /api/captions`, `GET /api/captions/media/...`) или поле JSON-тела (`POST /api/captions`). Если не передан — используется `gal` (обратная совместимость с текущей CEP-панелью).

## Структура ключей в R2

```
{Gal Captions | Spunkram Captions}/
  {Category Name}/
    {Caption Name}/
      thumb.png          # preview image (публичный CDN-URL)
      preview.mp4        # preview video (публичный CDN-URL)
      project.mogrt      # Premiere (только по подписке, стримится через сервер)
      project.aep        # After Effects (только по подписке, стримится через сервер)
      definition.json    # метаданные MOGRT (не отдаётся публично, стримится через сервер)
```

Пример:

```
Gal Captions/
  Base/
    Base Caption_01/
      thumb.png
      preview.mp4
      project.mogrt
      project.aep
      definition.json
```

`thumb.png` / `preview.mp4` лежат в **публичном** бакете и отдаются прямыми ссылками на CDN (`R2_PUBLIC_CDN`), но `project.mogrt` / `project.aep` / `definition.json` **никогда** не отдаются как прямой CDN-URL — сервер всегда сам читает объект из R2 (`GetObjectCommand`) и стримит его клиенту только после проверки сессии/подписки в `POST /api/captions`.

### Заливка / обновление файлов

```bash
node --env-file=.env scripts/migrate-captions-to-r2.mjs [--dry-run] [--source=<dir>] [--dest=<a,b>] [--skip-existing]
```

Скрипт читает локальную папку (по умолчанию `C:\Users\nipap\Desktop\Captions`, либо `CAPTIONS_ROOT`) и заливает файлы под оба префикса (`--dest` по умолчанию `"Gal Captions,Spunkram Captions"`).

---

## Endpoints

### 1. `GET /api/captions?brand=gal|spunkram`

Публичный. Auth не нужен.

Возвращает дерево категорий → captions для отрисовки UI. `brand` опционален, по умолчанию `"gal"`.

#### Response `200`

```json
{
  "rootConfigured": true,
  "brand": "gal",
  "categories": [
    {
      "name": "Base",
      "slug": "base",
      "captions": [
        {
          "id": "Base/Base Caption_01",
          "name": "Base Caption_01",
          "slug": "base-caption_01",
          "previewImageUrl": "https://cdn.motionflow.pro/Gal%20Captions/Base/Base%20Caption_01/thumb.png",
          "previewVideoUrl": "https://cdn.motionflow.pro/Gal%20Captions/Base/Base%20Caption_01/preview.mp4",
          "files": {
            "mogrt": true,
            "aep": true,
            "definition": true
          }
        }
      ]
    }
  ]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `brand` | `string` | Эхо выбранного бренда каталога (`gal` \| `spunkram`) |
| `categories[].name` | `string` | Имя папки категории (для заголовка секции) |
| `categories[].slug` | `string` | URL-friendly slug категории |
| `captions[].id` | `string` | **Стабильный id** для скачивания: `Category/Caption Folder` |
| `captions[].name` | `string` | Имя папки caption |
| `captions[].slug` | `string` | URL-friendly slug |
| `captions[].previewImageUrl` | `string \| null` | Прямая CDN-ссылка на превью-картинку |
| `captions[].previewVideoUrl` | `string \| null` | Прямая CDN-ссылка на превью-видео |
| `captions[].files.mogrt` | `boolean` | Есть ли `project.mogrt` |
| `captions[].files.aep` | `boolean` | Есть ли `project.aep` |
| `captions[].files.definition` | `boolean` | Есть ли `definition.json` |

Пустой префикс в R2 → `{ "categories": [] }`. Ответ кешируется в памяти процесса на 30 секунд на бренд (см. `buildCaptionsTree` в `lib/captions-catalog.ts`).

#### Ошибки

| Status | Body |
|--------|------|
| `500` | `{ "error": "Could not load captions." }` |

---

### 2. `GET /api/captions/media/{Category}/{Caption}/{file}?brand=gal|spunkram` (legacy)

Публичный. Auth не нужен. **Оставлен только для обратной совместимости** — новые клиенты должны использовать `previewImageUrl` / `previewVideoUrl` из `GET /api/captions` напрямую.

Для **preview-файлов** (`thumb.png`, `preview.mp4`) делает `302`-редирект на прямой CDN-URL в R2. Любые другие файлы (`project.mogrt`, `project.aep`, `definition.json`) → `404` (для них прямой публичный URL никогда не строится).

#### Пример

```
GET /api/captions/media/Base/Base%20Caption_01/thumb.png
→ 302 Location: https://cdn.motionflow.pro/Gal%20Captions/Base/Base%20Caption_01/thumb.png
```

#### Ошибки

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid path" }` |
| `404` | `{ "error": "Not found" }` |

---

### 3. `POST /api/captions`

Требует **сессию (cookie)** или **CEP identity** + **активную подписку**.

Скачивает проектный файл. Ответ — **бинарный stream** (не JSON), с `Content-Disposition: attachment`.

#### Request

```http
POST /api/captions
Content-Type: application/json
Cookie: <session>   # опционально, если есть web-сессия
```

```json
{
  "id": "Base/Base Caption_01",
  "file": "mogrt",
  "brand": "gal",
  "user": {
    "id": "user_…",
    "email": "user@example.com"
  }
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `id` | `string` | да | Значение `captions[].id` из дерева |
| `file` | `"mogrt" \| "aep" \| "definition"` | нет | По умолчанию `"mogrt"` |
| `brand` | `"gal" \| "spunkram"` | нет | По умолчанию `"gal"` |
| `user.id` / `user.email` | `string` | для CEP | Identity панели (см. CEP auth ниже) |
| `userId` / `email` | `string` | альтернатива | Топ-level поля вместо `user` |

Приоритет auth: **Bearer CEP token** → **session cookie**.

| `file` | Ответ |
|--------|--------|
| `mogrt` | binary `project.mogrt` |
| `aep` | binary `project.aep` |
| `definition` | JSON `definition.json` (`Content-Type: application/json`) |

#### Response `200` (mogrt / aep)

Binary file:

| Header | Пример |
|--------|--------|
| `Content-Type` | `application/octet-stream` |
| `Content-Disposition` | `attachment; filename="Base%20Caption_01.mogrt"; filename*=UTF-8''...` |
| `Cache-Control` | `private, no-store` |

#### Response `200` (`definition`)

Распарсенный JSON MOGRT definition (`capsuleName`, `clientControls`, …) — для вкладки Styles.

#### Пример на клиенте (fetch → blob → download)

```ts
async function downloadCaption(id: string, file: "mogrt" | "aep" | "definition" = "mogrt") {
  const res = await fetch("/api/captions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, file }),
  });

  if (res.status === 401) {
    // data.code === "UNAUTHORIZED" → sign-in
    throw new Error("unauthorized");
  }
  if (res.status === 403) {
    const data = await res.json();
    // data.code === "SUBSCRIPTION_REQUIRED" → pricing
    throw new Error(data.code ?? "forbidden");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "download failed");
  }

  if (file === "definition") {
    return res.json();
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(disposition);
  const rawName = decodeURIComponent(match?.[1] ?? match?.[2] ?? `${id}.${file}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = rawName;
  a.click();
  URL.revokeObjectURL(url);
}
```

#### Ошибки (JSON)

| Status | Body | Когда |
|--------|------|--------|
| `400` | `{ "error": "invalid id" }` | нет / пустой `id` |
| `400` | `{ "error": "file must be \"mogrt\", \"aep\", or \"definition\"" }` | неверный `file` |
| `400` | `{ "error": "Invalid JSON body" }` | битый JSON |
| `401` | `{ "error": "Unauthorized", "code": "UNAUTHORIZED" }` | нет сессии и нет валидного CEP identity |
| `403` | `{ "error": "...", "code": "SUBSCRIPTION_REQUIRED" }` | нет активной подписки |
| `404` | `{ "error": "Project file not found.", "code": "PROJECT_NOT_READY" }` | нет caption или файла |
| `500` | `{ "error": "Could not prepare download." }` | внутренняя ошибка |

Перед `POST` можно смотреть `files.mogrt` / `files.aep` / `files.definition` в дереве, чтобы не дергать отсутствующий формат.

---

### 4. `POST /api/generations/captions` (Transcribe)

ASR: [ElevenLabs Scribe v2](https://replicate.com/elevenlabs/scribe-v2) на Replicate (`timestamps_granularity=word`). Один запрос; ответ модели отдаётся как есть (без перекладки в старый Whisper `{ words.chunks, chunk.chunks }`).

`multipart/form-data`, `credentials: "include"`. Auth: session cookie **или** CEP form fields `email` / `userId` + подписка. Таймаут клиента: до **5 минут** (`maxDuration` на сервере тоже 300s).

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `file` | audio/mpeg (mp3) | да | Аудио для распознавания |
| `language` | string | нет | ISO-код; `auto` не передаём (сервер шлёт `language_code: "auto"`) |
| `translateTo` | string | нет | ISO-код; `off` не передаём — перевод через Claude, слова пересобираются пропорционально, форма ответа остаётся Scribe |
| `userId` | string | нет | CEP identity id |
| `email` | string | нет | CEP identity email |

#### Успешный ответ `200` (JSON)

Форма Scribe v2 + флаг `translated`:

```json
{
  "text": "Hello world.",
  "language_code": "eng",
  "language_probability": 0.98,
  "duration_seconds": 1.9,
  "words": [
    { "text": "Hello", "start": 1.02, "end": 1.35, "type": "word" },
    { "text": " ", "start": 1.35, "end": 1.4, "type": "spacing" },
    { "text": "world.", "start": 1.4, "end": 1.9, "type": "word" }
  ],
  "translated": false
}
```

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `text` | да | Полный транскрипт |
| `words` | да | Массив токенов Scribe (`word` / `spacing` / …) |
| `words[].text` | да | Текст токена |
| `words[].start` / `end` | для `type: "word"` | **секунды float** относительно **начала переданного MP3** |
| `words[].type` | да | Обычно `word` или `spacing` (`tag_audio_events` на сервере выключен) |
| `translated` | да | `true` если сработал `translateTo` |

#### Критично для синка с голосом (таймлайн AE / Premiere)

1. Таймкоды — **секунды** (`number`), не миллисекунды и не таймкод-строки.
2. Время **относительно начала файла**, включая тишину в начале, если она есть в MP3.
3. Первое слово **не сбрасывается в `0`**, если речь начинается позже — иначе captions поедут относительно голоса.
4. Панель сама добавляет `offset` только для сценария «транскрипт с выделения» (inPoint слоя / клипа).
5. Для сегментов captions обычно берут только `words` с `type === "word"`.

#### Ошибки

Те же, что у download:

| Status | `code` | Поведение панели |
|--------|--------|------------------|
| `401` | `UNAUTHORIZED` | Please sign in to continue |
| `403` | `SUBSCRIPTION_REQUIRED` | An active subscription is required |

CEP читает `code` с любого `!res.ok` — статус `403` обязателен для подписки.

Прочие ошибки: `{ "error": "…" }` (upload / Replicate / пустой результат).

---

## CEP panel auth

Панель авторизуется через device-code login:

1. `POST /api/cep/auth/device` → verification URL
2. Пользователь подтверждает в браузере
3. `POST /api/cep/auth/token` → Bearer token
4. Дальше все gated-запросы: `Authorization: Bearer <token>`

Каталог и media остаются публичными: ошибки входа показываются только на **выборе стиля (definition)** / Transcribe / download проекта — не при просмотре каталога.

---

## Рекомендуемый UX-флоу (как делает CEP)

1. `GET /api/captions` → сетка стилей по `categories` (публично, без auth).
2. Карточка: `previewImageUrl` как poster, на hover — `<video src={previewVideoUrl}>`.
3. **Выбор стиля / вкладка Styles** → `POST /api/captions` с `file: "definition"`  
   (нужны auth + подписка; ответ — JSON `clientControls` для Styles UI).  
   Если в каталоге `files.definition !== true`, панель definition не запросит → Styles пустой.
4. **Transcribe** → render MP3 из AE/PPro → `POST /api/generations/captions` → ответ Scribe (`words[]` с `start`/`end`, брать `type === "word"`); параллельно при необходимости `file: "aep"` (AE) или `"mogrt"` (PPro).
5. Ошибки только на защищённых шагах (3–4):
   - `401` + `UNAUTHORIZED` → sign-in;
   - `403` + `SUBSCRIPTION_REQUIRED` → pricing.
6. Правки Styles → применение values ко всем сегментам по путям `uiName` из definition (группа **System** панелью не показывается).

**Замечание:** `definition` отдаётся как `application/json`; CEP читает через `arrayBuffer` + `JSON.parse` — оба варианта ок.

---

## Безопасность (кратко)

| Ресурс | Доступ |
|--------|--------|
| Дерево каталога | публично |
| `thumb.png`, `preview.mp4` | публично, прямой CDN-URL (R2_PUBLIC_BUCKET) |
| `definition.json` | POST + session/CEP + подписка (сервер сам читает объект из R2, прямого URL нет) |
| `project.mogrt`, `project.aep` | POST + session/CEP + подписка (сервер сам читает объект из R2, прямого URL нет) |
| Transcribe | POST + session/CEP + подписка |
| Path traversal (`..`) | отклоняется на сервере |
| CEP body identity | только non-production |
