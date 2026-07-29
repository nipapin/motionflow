# Captions Catalog API

Документация для клиентской части. Источник данных на локальной разработке — папка на диске (`CAPTIONS_ROOT`). Позже тот же контракт будет работать поверх R2 (структура ключей совпадает с деревом папок).

## Структура файлов на диске

```
CAPTIONS_ROOT/
  {Category Name}/
    {Caption Name}/
      thumb.png          # preview image (публичный)
      preview.mp4        # preview video (публичный)
      project.mogrt      # Premiere (только по подписке)
      project.aep        # After Effects (только по подписке)
      definition.json    # метаданные MOGRT (не отдаётся публично)
```

Пример:

```
Captions/
  Base/
    Base Caption_01/
      thumb.png
      preview.mp4
      project.mogrt
      project.aep
      definition.json
```

Env (опционально):

```env
CAPTIONS_ROOT=C:\Users\nipap\Desktop\Captions
```

Если не задан — используется `C:\Users\nipap\Desktop\Captions`.

---

## Endpoints

### 1. `GET /api/captions`

Публичный. Auth не нужен.

Возвращает дерево категорий → captions для отрисовки UI.

#### Response `200`

```json
{
  "rootConfigured": true,
  "categories": [
    {
      "name": "Base",
      "slug": "base",
      "captions": [
        {
          "id": "Base/Base Caption_01",
          "name": "Base Caption_01",
          "slug": "base-caption_01",
          "previewImageUrl": "/api/captions/media/Base/Base%20Caption_01/thumb.png",
          "previewVideoUrl": "/api/captions/media/Base/Base%20Caption_01/preview.mp4",
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
| `categories[].name` | `string` | Имя папки категории (для заголовка секции) |
| `categories[].slug` | `string` | URL-friendly slug категории |
| `captions[].id` | `string` | **Стабильный id** для скачивания: `Category/Caption Folder` |
| `captions[].name` | `string` | Имя папки caption |
| `captions[].slug` | `string` | URL-friendly slug |
| `captions[].previewImageUrl` | `string \| null` | URL превью-картинки |
| `captions[].previewVideoUrl` | `string \| null` | URL превью-видео |
| `captions[].files.mogrt` | `boolean` | Есть ли `project.mogrt` |
| `captions[].files.aep` | `boolean` | Есть ли `project.aep` |
| `captions[].files.definition` | `boolean` | Есть ли `definition.json` |

Пустая папка / нет root → `{ "categories": [] }`.

#### Ошибки

| Status | Body |
|--------|------|
| `500` | `{ "error": "Could not load captions." }` |

---

### 2. `GET /api/captions/media/{Category}/{Caption}/{file}`

Публичный. Auth не нужен.

Отдаёт **только** preview-файлы:

- `thumb.png`
- `preview.mp4`

Любые другие файлы (`project.mogrt`, `project.aep`, `definition.json`) → `404`.

URL уже приходят готовыми в `previewImageUrl` / `previewVideoUrl` из `GET /api/captions`. Можно ставить напрямую в `<img>` / `<video>`.

#### Пример

```
GET /api/captions/media/Base/Base%20Caption_01/thumb.png
GET /api/captions/media/Base/Base%20Caption_01/preview.mp4
```

#### Response `200`

Binary stream:

- `Content-Type`: `image/png` или `video/mp4`
- `Cache-Control`: `public, max-age=3600`

#### Ошибки

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid path" }` |
| `404` | `{ "error": "Not found" }` |
| `500` | `{ "error": "Could not read file" }` |

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
  "user": {
    "id": "dev-admin",
    "email": "admin@mail.ru"
  }
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `id` | `string` | да | Значение `captions[].id` из дерева |
| `file` | `"mogrt" \| "aep" \| "definition"` | нет | По умолчанию `"mogrt"` |
| `user.id` / `user.email` | `string` | для CEP | Identity панели (см. CEP auth ниже) |
| `userId` / `email` | `string` | альтернатива | Топ-level поля вместо `user` |

Приоритет auth: **session cookie** → иначе CEP body identity (только non-production).

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

`multipart/form-data`, `credentials: "include"`. Auth: session cookie **или** CEP form fields `email` / `userId` + подписка. Таймаут клиента: до **5 минут** (`maxDuration` на сервере тоже 300s).

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `file` | audio/mpeg (mp3) | да | Аудио для распознавания |
| `language` | string | нет | ISO-код; `auto` не передаём (сервер трактует как auto) |
| `translateTo` | string | нет | ISO-код; `off` не передаём |
| `userId` | string | нет | CEP identity id |
| `email` | string | нет | CEP identity email |

#### Успешный ответ `200` (JSON)

```json
{
  "words": {
    "chunks": [
      { "text": "Hello", "timestamp": [1.02, 1.35] },
      { "text": "world.", "timestamp": [1.40, 1.90] }
    ]
  },
  "chunk": {
    "chunks": [
      { "text": "Hello world.", "timestamp": [1.02, 1.90] }
    ]
  }
}
```

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `words.chunks` | да | Пословная нарезка (основной источник для сегментов) |
| `chunk.chunks` | желательно | По предложениям / фразам (панель может пересобрать из `words`) |
| `chunks[].text` | да | Текст слова / фразы |
| `chunks[].timestamp` | да | `[start, end]` — **секунды float** относительно **начала переданного MP3** |

#### Критично для синка с голосом (таймлайн AE / Premiere)

1. Таймкоды — **секунды** (`number`), не миллисекунды и не таймкод-строки.
2. Время **относительно начала файла**, включая тишину в начале, если она есть в MP3.
3. Первое слово **не сбрасывается в `0`**, если речь начинается позже — иначе captions поедут относительно голоса.
4. Панель сама добавляет `offset` только для сценария «транскрипт с выделения» (inPoint слоя / клипа).

#### Ошибки

Те же, что у download:

| Status | `code` | Поведение панели |
|--------|--------|------------------|
| `401` | `UNAUTHORIZED` | Please sign in to continue |
| `403` | `SUBSCRIPTION_REQUIRED` | An active subscription is required |

CEP читает `code` с любого `!res.ok` — статус `403` обязателен для подписки.

Прочие ошибки: `{ "error": "…" }` (upload / Replicate / пустой результат).

---

## CEP panel auth (локальная разработка)

См. также `captions-cep/docs/cep-client-auth.md`.

Панель шлёт identity в body после flyout **Sign in as admin@mail.ru**:

| Поле | Значение |
|------|----------|
| `email` | `admin@mail.ru` |
| `id` / `userId` | `dev-admin` |

На бэкенде (только `NODE_ENV !== "production"`):

```env
CEP_DEV_ADMIN_EMAIL=admin@mail.ru
CEP_DEV_ADMIN_ID=dev-admin
```

(дефолты те же, если env не задан.)

В **production** CEP body-identity отключён — нужна настоящая session cookie.

Каталог и media остаются публичными: ошибки входа показываются только на **выборе стиля (definition)** / Transcribe / download проекта — не при просмотре каталога.

---

## Рекомендуемый UX-флоу (как делает CEP)

1. `GET /api/captions` → сетка стилей по `categories` (публично, без auth).
2. Карточка: `previewImageUrl` как poster, на hover — `<video src={previewVideoUrl}>`.
3. **Выбор стиля / вкладка Styles** → `POST /api/captions` с `file: "definition"`  
   (нужны auth + подписка; ответ — JSON `clientControls` для Styles UI).  
   Если в каталоге `files.definition !== true`, панель definition не запросит → Styles пустой.
4. **Transcribe** → render MP3 из AE/PPro → `POST /api/generations/captions` → сегменты из таймкодов `words.chunks`; параллельно при необходимости `file: "aep"` (AE) или `"mogrt"` (PPro).
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
| `thumb.png`, `preview.mp4` | публично через media |
| `definition.json` | POST + session/CEP + подписка |
| `project.mogrt`, `project.aep` | POST + session/CEP + подписка |
| Transcribe | POST + session/CEP + подписка |
| Path traversal (`..`) | отклоняется на сервере |
| CEP body identity | только non-production |

---

## Миграция на R2 (позже)

Контракт API **не меняется**. На сервере вместо FS будет чтение объектов с тем же ключом:

`{Category}/{Caption}/{filename}`

Клиенту менять ничего не нужно: URL media и `id` остаются в том же виде.
