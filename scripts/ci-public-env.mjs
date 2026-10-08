import { appendFileSync } from "node:fs";
const values = JSON.parse(process.env.BUILD_PUBLIC_ENV || "{}");
for (const [key, value] of Object.entries(values)) {
  if (!/^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key) || typeof value !== "string" || /[\r\n\0]/.test(value)) throw new Error("Invalid public build environment");
  appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
console.log(`Loaded ${Object.keys(values).length} public build variables.`);
