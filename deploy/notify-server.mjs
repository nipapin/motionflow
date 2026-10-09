// Installed beside the existing webhook; subscribers and bot credentials stay on VPS.
import { getBotToken } from "/webhook-reciever/lib/env.js";
import { resolveChatIds } from "/webhook-reciever/lib/subscribers.js";
import { updateRunNotification } from "./lib/telegram-run.mjs";
import { translateCommit } from "./lib/commit-translation.mjs";
try {
  const payload = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
  const result = await updateRunNotification({
    token: getBotToken(), chatIds: await resolveChatIds(), payload,
    stateDirectory: "/root/motionflow-ci/telegram-runs",
    translate: translateCommit,
  });
  console.log(`Existing Telegram bot: ${result.sent} sent, ${result.edited} edited, ${result.failed} failed${result.skipped ? "; stale progress skipped" : ""}.`);
  if (result.failed) process.exitCode = 1;
} catch {
  console.error("Could not update Telegram run notification.");
  process.exitCode = 1;
}
