import "server-only";

/**
 * Telegram Bot API helper.
 *
 * Port of Laravel `AutoPosting::telegramReport()` (`app/Http/Controllers/Automation/AutoPosting.php`),
 * which used the PHP `\TelegramBot\Api\BotApi` SDK. Here we just hit the public Bot API
 * with `fetch` to avoid a third-party dependency.
 *
 * Env:
 *   - `TELEGRAM_BOT_TOKEN`         Bot token (e.g. `8307570295:AAE…`).
 *   - `TELEGRAM_REQUESTS_CHAT_ID`  Chat ID for new contact-form request notifications
 *                                  (groups use a negative integer, e.g. `-4906643001`).
 *   - `GROUP_CHAT_ID`              Support / CEP error reports group chat id.
 *   - `TOPIC_ID`                   Forum topic id (`message_thread_id`) for CEP errors.
 *
 * If either env var is missing the call is silently skipped (with a `console.warn`)
 * — submitting the form must keep working even if the notification channel is down.
 */

export type TelegramParseMode = "Markdown" | "MarkdownV2" | "HTML";

interface SendTelegramMessageOptions {
    parseMode?: TelegramParseMode;
    disablePreview?: boolean;
    /** Forum topic id inside a supergroup (Telegram `message_thread_id`). */
    messageThreadId?: number | string;
}

const API_BASE = "https://api.telegram.org";

/** Strip surrounding quotes / whitespace — common when env is set as KEY="value". */
function envValue(name: string): string | null {
    const raw = process.env[name];
    if (raw == null) return null;
    let v = raw.trim();
    if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
    ) {
        v = v.slice(1, -1).trim();
    }
    return v || null;
}

function getBotToken(): string | null {
    return envValue("TELEGRAM_BOT_TOKEN");
}

function getRequestsChatId(): string | null {
    return envValue("TELEGRAM_REQUESTS_CHAT_ID");
}

function getSupportGroupChatId(): string | null {
    return envValue("GROUP_CHAT_ID");
}

function getSupportTopicId(): string | null {
    return envValue("TOPIC_ID");
}

/**
 * Low-level: send a text message to an arbitrary chat.
 * Returns `true` on success, `false` on failure (errors are logged, never thrown).
 */
export async function sendTelegramMessage(
    chatId: string,
    text: string,
    options: SendTelegramMessageOptions = {},
): Promise<boolean> {
    const token = getBotToken();
    if (!token) {
        console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping notification");
        return false;
    }

    const url = `${API_BASE}/bot${token}/sendMessage`;
    const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        disable_web_page_preview: options.disablePreview ?? true,
    };
    if (options.parseMode) {
        body.parse_mode = options.parseMode;
    }
    if (options.messageThreadId !== undefined && options.messageThreadId !== "") {
        const threadId = Number(options.messageThreadId);
        if (Number.isFinite(threadId)) {
            body.message_thread_id = threadId;
        }
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            console.error(
                `[telegram] sendMessage failed (${res.status}): ${detail.slice(0, 300)}`,
            );
            return false;
        }
        return true;
    } catch (err) {
        console.error("[telegram] sendMessage threw:", err);
        return false;
    }
}

/**
 * High-level: send a "new contact-form request" notification to the staff chat.
 * Mirrors `AutoPosting::telegramReport($msg, withMarkdown: true)` from Laravel.
 */
export async function sendTelegramRequestsReport(
    text: string,
    options: { parseMode?: TelegramParseMode } = {},
): Promise<boolean> {
    const chatId = getRequestsChatId();
    if (!chatId) {
        console.warn(
            "[telegram] TELEGRAM_REQUESTS_CHAT_ID is not set — skipping notification",
        );
        return false;
    }
    return sendTelegramMessage(chatId, text, {
        parseMode: options.parseMode ?? "Markdown",
        disablePreview: true,
    });
}

/**
 * CEP / Spunkram support error reports → `GROUP_CHAT_ID` forum topic `TOPIC_ID`.
 */
export async function sendTelegramSupportReport(
    text: string,
    options: { parseMode?: TelegramParseMode } = {},
): Promise<boolean> {
    const chatId = getSupportGroupChatId();
    if (!chatId) {
        console.warn("[telegram] GROUP_CHAT_ID is not set — skipping support notification");
        return false;
    }
    const topicId = getSupportTopicId();
    if (!topicId) {
        console.warn("[telegram] TOPIC_ID is not set — skipping support notification");
        return false;
    }
    const token = getBotToken();
    if (!token) {
        console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping support notification");
        return false;
    }

    console.info(
        `[telegram] support report → chat=${chatId} topic=${topicId} token=…${token.slice(-6)} bytes=${text.length}`,
    );
    const ok = await sendTelegramMessage(chatId, text, {
        parseMode: options.parseMode ?? "HTML",
        disablePreview: true,
        messageThreadId: topicId,
    });
    if (ok) {
        console.info("[telegram] support report delivered");
    } else {
        console.error("[telegram] support report NOT delivered");
    }
    return ok;
}
