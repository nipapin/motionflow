let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  const data = JSON.parse(input);
  if (data.status !== "ok" || data.release !== process.argv[2] || !data.database || !data.redis) throw new Error();
} catch { console.error("New release, MySQL or Redis is not ready"); process.exitCode = 1; }
