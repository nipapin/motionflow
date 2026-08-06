import "server-only";

/**
 * Telegram Bot API helper.
 *
 * Env:
 *   - `TELEGRAM_BOT_TOKEN`
 *   - `TELEGRAM_REQUESTS_CHAT_ID`  contact-form notifications
 *   - `GROUP_CHAT_ID`              CEP support group
 *   - `TOPIC_ID`                   forum topic (`message_thread_id`)
 */

export type TelegramParseMode = "Markdown" | "MarkdownV2" | "HTML";

export type TelegramSendResult = {
    ok: boolean;
    /** Machine-readable reason when ok=false */
    error?: string;
    /** Safe diagnostics (no secrets) */
    diag?: {
        has_token: boolean;
        has_group: boolean;
        has_topic: boolean;
        token_suffix?: string;
        group_id?: string;
        topic_id?: string;
    };
};

interface SendTelegramMessageOptions {
    parseMode?: TelegramParseMode;
    disablePreview?: boolean;
    messageThreadId?: number | string;
}

const API_BASE = "https://api.telegram.org";

/** Strip surrounding quotes / whitespace — common when env is set as KEY="value". */
function envValue(name: string): string | null {
    const raw = process.env[name];
    if (raw == null) return null;
    let v = String(raw).trim();
    // Strip one or more layers of quotes (pm2 / dotenv / shell).
    for (let i = 0; i < 2; i++) {
        if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
        ) {
            v = v.slice(1, -1).trim();
        }
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

function supportDiag(): NonNullable<TelegramSendResult["diag"]> {
    const token = getBotToken();
    const group = getSupportGroupChatId();
    const topic = getSupportTopicId();
    return {
        has_token: Boolean(token),
        has_group: Boolean(group),
        has_topic: Boolean(topic),
        token_suffix: token ? token.slice(-4) : undefined,
        group_id: group || undefined,
        topic_id: topic || undefined,
    };
}

/**
 * Low-level: send a text message to an arbitrary chat.
 */
export async function sendTelegramMessage(
    chatId: string,
    text: string,
    options: SendTelegramMessageOptions = {},
): Promise<TelegramSendResult> {
    const token = getBotToken();
    if (!token) {
        console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping notification");
        return { ok: false, error: "missing_TELEGRAM_BOT_TOKEN", diag: supportDiag() };
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
            let description = detail.slice(0, 300);
            try {
                const parsed = JSON.parse(detail) as { description?: string };
                if (parsed.description) description = parsed.description;
            } catch {
                // keep raw
            }
            console.error(
                `[telegram] sendMessage failed (${res.status}): ${description}`,
            );
            return {
                ok: false,
                error: `telegram_api_${res.status}: ${description}`,
                diag: supportDiag(),
            };
        }
        return { ok: true, diag: supportDiag() };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[telegram] sendMessage threw:", err);
        return { ok: false, error: `telegram_fetch: ${msg}`, diag: supportDiag() };
    }
}

/**
 * Contact-form staff chat notification.
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
    const result = await sendTelegramMessage(chatId, text, {
        parseMode: options.parseMode ?? "Markdown",
        disablePreview: true,
    });
    return result.ok;
}

/**
 * CEP / Spunkram support error reports → `GROUP_CHAT_ID` forum topic `TOPIC_ID`.
 */
export async function sendTelegramSupportReport(
    text: string,
    options: { parseMode?: TelegramParseMode } = {},
): Promise<TelegramSendResult> {
    const diag = supportDiag();
    const chatId = getSupportGroupChatId();
    if (!chatId) {
        console.warn("[telegram] GROUP_CHAT_ID is not set — skipping support notification");
        return { ok: false, error: "missing_GROUP_CHAT_ID", diag };
    }
    const topicId = getSupportTopicId();
    if (!topicId) {
        console.warn("[telegram] TOPIC_ID is not set — skipping support notification");
        return { ok: false, error: "missing_TOPIC_ID", diag };
    }
    const token = getBotToken();
    if (!token) {
        console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping support notification");
        return { ok: false, error: "missing_TELEGRAM_BOT_TOKEN", diag };
    }

    console.info(
        `[telegram] support report → chat=${chatId} topic=${topicId} token=…${token.slice(-4)} bytes=${text.length}`,
    );

    // Prefer HTML; if Telegram rejects parse entities, retry as plain text.
    let result = await sendTelegramMessage(chatId, text, {
        parseMode: options.parseMode ?? "HTML",
        disablePreview: true,
        messageThreadId: topicId,
    });

    if (
        !result.ok &&
        result.error &&
        /can't parse entities|parse entities|unsupported start tag/i.test(result.error)
    ) {
        console.warn("[telegram] HTML parse failed — retrying as plain text");
        const plain = text.replace(/<[^>]+>/g, "");
        result = await sendTelegramMessage(chatId, plain, {
            disablePreview: true,
            messageThreadId: topicId,
        });
    }

    if (result.ok) {
        console.info("[telegram] support report delivered");
    } else {
        console.error("[telegram] support report NOT delivered:", result.error);
    }
    return result;
}
