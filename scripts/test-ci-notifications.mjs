import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatRunNotification, updateRunNotification } from "../deploy/lib/telegram-run.mjs";
const root = mkdtempSync(join(tmpdir(), "motionflow-telegram-check-"));
const payload = { status: "started", sha: "abcdef12345", url: "https://github.com/nipapin/motionflow/actions/runs/123/attempts/1" };
const options = { token: "fixture-token", chatIds: ["-1001", "2", "3"], payload, stateDirectory: root };
const calls = [];
let nextId = 10;
const response = (body, status=200) => ({ ok: status===200, status, json: async () => body });
const api = async (url, request) => {
  const method = url.split("/").at(-1), body = JSON.parse(request.body);
  calls.push({ method, body });
  return response({ ok: true, result: { message_id: method === "sendMessage" ? nextId++ : body.message_id } });
};
try {
  for (const [repo, label] of [["ione-premiere-basics", "Odin Pro"], ["aniomLaravelSite", "Laravel"]]) {
    const formatted = formatRunNotification({ ...payload, url: payload.url.replace("/motionflow/", `/${repo}/`) });
    assert.equal(formatted.key, "123-1");
    assert.ok(formatted.body.text.includes(label));
  }
  assert.throws(() => formatRunNotification({ ...payload, url: payload.url.replace("/motionflow/", "/other/") }), /Invalid run URL/);
  assert.deepEqual(await updateRunNotification(options, api), { sent: 3, edited: 0, failed: 0, skipped: false });
  const initial = JSON.parse(readFileSync(join(root, "123-1.json"), "utf8")).messages;
  for (const status of ["deploying", "success"]) {
    const result = await updateRunNotification({ ...options, payload: { ...payload, status } }, api);
    assert.equal(result.sent, 0); assert.equal(result.edited, 3);
  }
  assert.equal(calls.filter(call => call.method === "sendMessage").length, 3);
  for (const call of calls.filter(call => call.method === "editMessageText")) assert.equal(call.body.message_id, initial[call.body.chat_id]);
  const count = calls.length;
  assert.equal((await updateRunNotification(options, api)).skipped, true);
  assert.equal(calls.length, count);
  // Each new attempt gets one new message, while cancellation edits that message.
  const second = { ...options, payload: { ...payload, url: payload.url.replace("attempts/1", "attempts/2") } };
  assert.equal((await updateRunNotification(second, api)).sent, 3);
  assert.equal((await updateRunNotification({ ...second, payload: { ...second.payload, status: "cancelled" } }, api)).edited, 3);
  // Idempotent completion is accepted without creating another message.
  const unchanged = await updateRunNotification({ ...options, payload: { ...payload, status: "success" } }, async () => response({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }, 400));
  assert.equal(unchanged.sent, 0); assert.equal(unchanged.edited, 3); assert.equal(unchanged.failed, 0);
  // Only a deleted/uneditable original message is replaced.
  const deletedCalls = [];
  const replaced = await updateRunNotification({ ...options, chatIds: ["2"], payload: { ...payload, status: "failure" } }, async (url, request) => {
    const method = url.split("/").at(-1); deletedCalls.push(method);
    return method === "editMessageText" ? response({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" }, 400) : api(url, request);
  });
  assert.equal(replaced.sent, 1); assert.deepEqual(deletedCalls, ["editMessageText", "sendMessage"]);
  const waits = []; let attempts = 0;
  const retry = await updateRunNotification({ ...options, chatIds: ["3"], payload: { ...payload, status: "failure" } }, async (url, request) => ++attempts === 1 ? response({ ok: false, error_code: 429, parameters: { retry_after: 100 } }, 429) : api(url, request), async ms => waits.push(ms));
  assert.equal(retry.sent, 0); assert.equal(retry.edited, 1); assert.deepEqual(waits, [15000]);
  assert.throws(() => formatRunNotification({ ...payload, url: "https://example.com/nipapin/motionflow/actions/runs/123/attempts/1" }), /Invalid run URL/);
  console.log("Telegram checks passed: one message per chat/run/attempt, persistent edits, progress, cancellation, retries, duplicate completion and deleted-message recovery.");
} finally {
  assert.equal(dirname(realpathSync(root)), realpathSync(tmpdir()));
  rmSync(root, { recursive: true, force: true });
}
