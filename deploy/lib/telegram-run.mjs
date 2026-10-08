import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const projects = { motionflow: "Motion Flow", "ione-premiere-basics": "Odin Pro", aniomLaravelSite: "Laravel" };
const titles = {
  started: "⏳ Motion Flow: сборка в GitHub Actions началась",
  deploying: "⏳ Motion Flow: сборка готова, обновляем сервер",
  success: "✅ Motion Flow обновлён — сборка выполнена в CI",
  failure: "❌ Motion Flow: ошибка сборки или деплоя",
  cancelled: "⏹ Motion Flow: сборка/деплой отменены",
  built: "✅ Motion Flow: сборка готова, сервер не обновлялся",
};
const terminal = new Set(["success", "failure", "cancelled", "built"]);
const escape = value => String(value ?? "").slice(0, 250).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function formatRunNotification(payload) {
  if (!titles[payload.status]) throw new Error("Invalid notification status");
  const url = new URL(payload.url);
  const match = url.pathname.match(/^\/nipapin\/([^/]+)\/actions\/runs\/(\d+)\/attempts\/(\d+)\/?$/);
  if (url.origin !== "https://github.com" || !match || !Object.hasOwn(projects, match[1]) || url.search || url.hash) throw new Error("Invalid run URL");
  return {
    key: `${match[2]}-${match[3]}`,
    body: {
      text: [titles[payload.status].replace("Motion Flow", projects[match[1]]), `Commit: <code>${escape(payload.sha?.slice(0, 7))}</code>`, escape(payload.detail), escape(url.href)].filter(Boolean).join("\n"),
      parse_mode: "HTML", disable_web_page_preview: true,
    },
  };
}

async function telegramRequest(token, method, body, fetchImpl, wait) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response, data;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      data = await response.json();
    } catch {
      if (attempt < 2) { await wait(1000 * (attempt + 1)); continue; }
      throw new Error("Telegram network request failed");
    }
    if (response.ok && data.ok) return { result: data.result };
    const description = String(data.description || "");
    if (method === "editMessageText" && data.error_code === 400) {
      if (description.includes("message is not modified")) return {};
      if (description.includes("message to edit not found") || description.includes("message can't be edited")) return { missing: true };
    }
    if ((data.error_code === 429 || response.status >= 500) && attempt < 2) {
      await wait(Math.max(1, Math.min(15, Number(data.parameters?.retry_after) || attempt + 1)) * 1000);
      continue;
    }
    throw new Error(`Telegram request failed (code ${Number(data.error_code) || response.status})`);
  }
}

// Caller uses flock on VPS, so start/progress/final workflows share one state safely.
export async function updateRunNotification({ token, chatIds, payload, stateDirectory }, fetchImpl = fetch, wait = pause) {
  const { key, body } = formatRunNotification(payload);
  if (!token || !chatIds.length) throw new Error("Telegram bot has no recipients");
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const file = join(stateDirectory, `${key}.json`);
  const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { messages: {}, status: null };
  const stage = status => terminal.has(status) ? 2 : status === "deploying" ? 1 : 0;
  if (stage(state.status) > stage(payload.status)) return { sent: 0, edited: 0, failed: 0, skipped: true };
  let sent = 0, edited = 0;
  const save = () => {
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, file);
  };
  const results = await Promise.allSettled([...new Set(chatIds.map(String))].map(async chat_id => {
    const message_id = state.messages[chat_id];
    if (message_id) {
      const result = await telegramRequest(token, "editMessageText", { ...body, chat_id, message_id }, fetchImpl, wait);
      if (!result.missing) { edited++; return; }
    }
    const result = await telegramRequest(token, "sendMessage", { ...body, chat_id }, fetchImpl, wait);
    if (!Number.isSafeInteger(result.result?.message_id)) throw new Error("Telegram returned no message ID");
    state.messages[chat_id] = result.result.message_id;
    save();
    sent++;
  }));
  const failed = results.filter(result => result.status === "rejected").length;
  state.status = payload.status;
  save();
  return { sent, edited, failed, skipped: false };
}
