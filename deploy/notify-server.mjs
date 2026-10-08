// Installed beside the existing webhook; subscribers and bot credentials stay on VPS.
import { getBotToken } from "/webhook-reciever/lib/env.js";
import { resolveChatIds } from "/webhook-reciever/lib/subscribers.js";
const payload = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
const titles = {
  started: "⏳ Motion Flow: сборка в GitHub Actions началась",
  success: "✅ Motion Flow обновлён — сборка выполнена в CI",
  failure: "❌ Motion Flow: ошибка сборки или деплоя",
  cancelled: "⏹ Motion Flow: сборка/деплой отменены",
  built: "✅ Motion Flow: сборка готова, сервер не обновлялся",
};
if (!titles[payload.status]) throw new Error("Invalid notification status");
const url = new URL(payload.url);
if (url.origin !== "https://github.com" || !url.pathname.startsWith("/nipapin/motionflow/actions/runs/")) throw new Error("Invalid run URL");
const escape = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").slice(0, 250);
const token = getBotToken(), chatIds = await resolveChatIds();
if (!token || !chatIds.length) throw new Error("Telegram bot has no recipients");
const text = `${titles[payload.status]}\nCommit: <code>${escape(payload.sha?.slice(0, 7))}</code>\n${escape(payload.detail)}\n${escape(url.href)}`;
const results = await Promise.allSettled(chatIds.map(async chat_id => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (response.ok && data.ok) return;
      if (data.error_code !== 429 && response.status < 500) throw new Error("Delivery rejected");
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.min(15, Number(data.parameters?.retry_after) || attempt + 1) * 1000));
    } catch {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
    }
  }
  throw new Error("Delivery failed");
}));
const failed = results.filter(r => r.status === "rejected").length;
console.log(`Existing Telegram bot: ${results.length - failed}/${results.length} notifications delivered.`);
if (failed) process.exitCode = 1;
