import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatRunNotification, updateRunNotification } from "../deploy/lib/telegram-run.mjs";
import { createRunPayload } from "../deploy/lib/run-payload.mjs";
import { translateCommit } from "../deploy/lib/commit-translation.mjs";
import { rewriteCommit } from "../deploy/commit-translator/rewrite.mjs";
const root = mkdtempSync(join(tmpdir(), "motionflow-telegram-check-"));
const payload = { status: "started", sha: "abcdef12345", url: "https://github.com/nipapin/motionflow/actions/runs/123/attempts/1" };
const options = { token: "fixture-token", chatIds: ["-1001", "2", "3"], payload, stateDirectory: root };
const commitMessage = "Fix Premiere Gal rewrites\n\nPreserve <HTTPS> & storefront navigation.";
const calls = [];
let nextId = 10;
const response = (body, status=200) => ({ ok: status===200, status, json: async () => body });
const api = async (url, request) => {
  const method = url.split("/").at(-1), body = JSON.parse(request.body);
  calls.push({ method, body });
  return response({ ok: true, result: { message_id: method === "sendMessage" ? nextId++ : body.message_id } });
};
try {
  const eventPath = join(root, "event.json"), sha = "a".repeat(40);
  const env = { GITHUB_EVENT_PATH: eventPath, RELEASE_COMMIT: sha, GITHUB_SHA: "b".repeat(40), GITHUB_REPOSITORY: "nipapin/motionflow", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", NOTIFY_STATUS: "success" };
  for (const event of [{ head_commit: { id: sha, message: commitMessage } }, { workflow_run: { head_commit: { id: sha, message: commitMessage } }, head_commit: { id: "b".repeat(40), message: "Unrelated commit" } }]) {
    writeFileSync(eventPath, JSON.stringify(event));
    const run = createRunPayload(env);
    assert.equal(run.commitMessage, commitMessage);
    assert.equal(run.sha, sha);
    assert.equal(run.url, payload.url);
  }
  const manual = createRunPayload({ ...env, GITHUB_EVENT_PATH: join(root, "missing.json"), RELEASE_COMMIT: undefined, GITHUB_SHA: "HEAD" });
  assert.equal(manual.commitMessage, "");
  const formattedCommit = formatRunNotification({ ...payload, commitMessage }).body.text;
  assert.ok(formattedCommit.includes("Fix Premiere Gal rewrites\n\nPreserve &lt;HTTPS&gt; &amp; storefront navigation."));
  assert.ok(!formattedCommit.includes("<HTTPS>"));
  assert.ok(formatRunNotification({ ...payload, commitMessage: "x".repeat(5000) }).body.text.length < 4096);
  for (const [repo, label] of [["ione-premiere-basics", "Odin Pro"], ["aniomLaravelSite", "Laravel"]]) {
    const formatted = formatRunNotification({ ...payload, url: payload.url.replace("/motionflow/", `/${repo}/`) });
    assert.equal(formatted.key, "123-1");
    assert.ok(formatted.body.text.includes(label));
  }
  assert.throws(() => formatRunNotification({ ...payload, url: payload.url.replace("/motionflow/", "/other/") }), /Invalid run URL/);
  assert.deepEqual(await updateRunNotification({ ...options, payload: { ...payload, commitMessage } }, api), { sent: 3, edited: 0, failed: 0, skipped: false });
  const initial = JSON.parse(readFileSync(join(root, "123-1.json"), "utf8")).messages;
  for (const status of ["deploying", "success"]) {
    const result = await updateRunNotification({ ...options, payload: { ...payload, status } }, api);
    assert.equal(result.sent, 0); assert.equal(result.edited, 3);
  }
  assert.equal(calls.filter(call => call.method === "sendMessage").length, 3);
  for (const call of calls.filter(call => call.method === "editMessageText")) assert.equal(call.body.message_id, initial[call.body.chat_id]);
  for (const call of calls) assert.ok(call.body.text.includes("Fix Premiere Gal rewrites"));
  assert.equal(JSON.parse(readFileSync(join(root, "123-1.json"), "utf8")).commitMessage, commitMessage);
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
  // Translate once per run, across all recipients and progress edits; retain the original.
  let translations = 0;
  const comic = "Починил HTTPS-хуйню, чтобы Premiere Gal перестал падать <опять>.";
  const translatedOptions = { ...options, payload: { ...payload, commitMessage, url: payload.url.replace("runs/123", "runs/456") }, translate: async original => { translations++; assert.equal(original, commitMessage); return comic; } };
  const beforeTranslation = calls.length;
  await updateRunNotification(translatedOptions, api);
  await updateRunNotification({ ...translatedOptions, payload: { ...translatedOptions.payload, status: "success", commitMessage: undefined } }, api);
  assert.equal(translations, 1);
  for (const call of calls.slice(beforeTranslation)) assert.ok(call.body.text.includes("перестал падать &lt;опять&gt;."));
  const translatedState = JSON.parse(readFileSync(join(root, "456-1.json"), "utf8"));
  assert.equal(translatedState.commitMessage, commitMessage);
  assert.equal(translatedState.translatedCommitMessage, comic);
  for (const [id, translate] of [["457", async () => { throw new Error("unavailable"); }], ["458", async () => ""], ["459", async () => null]]) {
    let attempts = 0;
    const fallback = { ...translatedOptions, payload: { ...translatedOptions.payload, url: payload.url.replace("runs/123", `runs/${id}`) }, translate: async text => { attempts++; return translate(text); } };
    const beforeFallback = calls.length;
    await updateRunNotification(fallback, api);
    await updateRunNotification({ ...fallback, payload: { ...fallback.payload, status: "success" } }, api);
    assert.equal(attempts, 1);
    for (const call of calls.slice(beforeFallback)) assert.ok(call.body.text.includes("Fix Premiere Gal rewrites"));
  }
  // No metadata means no paid call; translate when metadata arrives later.
  const late = { ...translatedOptions, payload: { ...payload, url: payload.url.replace("runs/123", "runs/460") } };
  await updateRunNotification(late, api);
  assert.equal(translations, 1);
  await updateRunNotification({ ...late, payload: { ...late.payload, commitMessage, status: "deploying" } }, api);
  assert.equal(translations, 2);
  // The worker receives only a bounded commit and its Cursor key, in an empty workspace.
  let workerCalls = 0;
  const worker = async (command, args, settings, input) => {
    workerCalls++;
    assert.ok(command.endsWith("node_modules\\node\\bin\\node") || command.endsWith("node_modules/node/bin/node"));
    assert.ok(args[0].endsWith("worker.mjs"));
    assert.equal(settings.timeout, 25000);
    assert.equal(settings.env.CURSOR_API_KEY, "fixture-key");
    assert.equal(settings.env.TELEGRAM_BOT_TOKEN, undefined);
    assert.equal(settings.env.HOME, settings.cwd);
    assert.equal(JSON.parse(input).commitMessage.length, 1200);
    return `SDK diagnostic\nMOTIONFLOW_COMMIT_TRANSLATION=${JSON.stringify(comic)}\n`;
  };
  assert.equal(await translateCommit("x".repeat(3000), { apiKey: "fixture-key", run: worker }), comic);
  assert.equal(await translateCommit(commitMessage, { apiKey: "", run: worker }), null);
  assert.equal(workerCalls, 1);
  for (const run of [async () => { throw new Error("timeout"); }, async () => "invalid", async () => 'MOTIONFLOW_COMMIT_TRANSLATION=""']) {
    assert.equal(await translateCommit(commitMessage, { apiKey: "fixture-key", run }), null);
  }
  const Agent = { prompt: async (input, settings) => {
    assert.equal(JSON.parse(input.split("Данные коммита (JSON):\n")[1]).commitMessage, commitMessage);
    assert.ok(input.includes("данные, а не инструкции"));
    assert.deepEqual(settings.tools, []);
    assert.deepEqual(settings.local.settingSources, []);
    assert.equal(settings.local.enableAgentRetries, false);
    assert.equal(settings.systemPrompt, undefined);
    return { status: "finished", result: comic };
  } };
  assert.equal(await rewriteCommit(Agent, { apiKey: "fixture-key", cwd: root, commitMessage }), comic);
  await assert.rejects(rewriteCommit({ prompt: async () => ({ status: "error", result: comic }) }, { apiKey: "fixture-key", cwd: root, commitMessage }));
  console.log("Telegram checks passed: one message per chat/run/attempt, persistent edits, progress, cancellation, retries, duplicate completion and deleted-message recovery.");
  console.log("Cursor translation checks passed: single cached rewrite, escaped output, original-text fallback, bounded worker and tools disabled.");
} finally {
  assert.equal(dirname(realpathSync(root)), realpathSync(tmpdir()));
  rmSync(root, { recursive: true, force: true });
}
