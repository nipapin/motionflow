import { rewriteCommit } from "./rewrite.mjs";

try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 10000) throw new Error("Input too large");
  }
  const { commitMessage } = JSON.parse(input);
  if (!process.env.CURSOR_API_KEY || typeof commitMessage !== "string") throw new Error("Missing input");
  const { Agent } = await import("@cursor/sdk");
  const text = await rewriteCommit(Agent, { apiKey: process.env.CURSOR_API_KEY, cwd: process.cwd(), commitMessage });
  console.log(`MOTIONFLOW_COMMIT_TRANSLATION=${JSON.stringify(text)}`);
} catch {
  // SDK errors can contain request metadata. Keep credentials out of CI logs.
  console.error("Cursor commit translation failed.");
  process.exitCode = 1;
}
