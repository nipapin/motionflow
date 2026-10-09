import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(new URL("../commit-translator/", import.meta.url));
const runWorker = (command, args, options, input) => new Promise((resolve, reject) => {
  const child = execFile(command, args, options, (error, stdout) => error ? reject(new Error("Cursor worker failed")) : resolve(stdout));
  child.stdin.on("error", () => {});
  child.stdin.end(input);
});

export async function translateCommit(commitMessage, { apiKey = process.env.CURSOR_API_KEY, run = runWorker } = {}) {
  if (!apiKey || !commitMessage?.trim()) return null;
  const cwd = mkdtempSync(join(tmpdir(), "motionflow-commit-"));
  try {
    const stdout = await run(join(runtime, "node_modules/node/bin/node"), [join(runtime, "worker.mjs")], {
      cwd, timeout: 25000, killSignal: "SIGKILL", maxBuffer: 256 * 1024,
      env: {
        CURSOR_API_KEY: apiKey, PATH: process.env.PATH,
        HOME: cwd, USERPROFILE: cwd, XDG_CONFIG_HOME: cwd, XDG_DATA_HOME: cwd,
        TMPDIR: cwd, TEMP: cwd, TMP: cwd,
      },
    }, JSON.stringify({ commitMessage: commitMessage.slice(0, 1200) }));
    const line = stdout.split(/\r?\n/).findLast(line => line.startsWith("MOTIONFLOW_COMMIT_TRANSLATION="));
    const translated = JSON.parse(line?.slice("MOTIONFLOW_COMMIT_TRANSLATION=".length) || "null");
    return typeof translated === "string" && translated.trim() ? translated.trim().slice(0, 600) : null;
  } catch {
    return null;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
