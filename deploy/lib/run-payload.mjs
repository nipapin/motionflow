import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function createRunPayload(env = process.env) {
  const sha = env.RELEASE_COMMIT || env.GITHUB_SHA;
  let commitMessage = "";
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    const commit = event.workflow_run?.head_commit || event.head_commit;
    if ((commit?.id || commit?.sha) === sha && typeof commit.message === "string") {
      commitMessage = commit.message.trim();
    }
  } catch { /* Manual runs can still read the checked-out commit below. */ }
  if (!commitMessage && /^[a-f0-9]{40}$/i.test(sha ?? "")) {
    try {
      commitMessage = execFileSync("git", ["show", "--no-patch", "--format=%B", sha], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
      }).trim();
    } catch { /* Missing metadata must not prevent a deployment notification. */ }
  }
  return {
    status: env.NOTIFY_STATUS,
    sha,
    commitMessage,
    detail: env.NOTIFY_DETAIL || "",
    url: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
  };
}
