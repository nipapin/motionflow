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
 *
 * If either env var is missing the call is silently skipped (with a `console.warn`)
 * — submitting the form must keep working even if the notification channel is down.
 */

export type TelegramParseMode = "Markdown" | "MarkdownV2" | "HTML";

interface SendTelegramMessageOptions {
    parseMode?: TelegramParseMode;
    disablePreview?: boolean;
}

const API_BASE = "https://api.telegram.org";

function getBotToken(): string | null {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    return token ? token : null;
}

function getRequestsChatId(): string | null {
    const chatId = process.env.TELEGRAM_REQUESTS_CHAT_ID?.trim();
    return chatId ? chatId : null;
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
