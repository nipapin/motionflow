const { releaseId } = require("./release.json");
module.exports = { apps: [{
  name: "motionflow", cwd: __dirname, script: "server.mjs",
  node_args: [`--env-file=${__dirname}/.env`],
  instances: 1, exec_mode: "fork", autorestart: true,
  restart_delay: 3000, max_memory_restart: "1G", time: true,
  env: { NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3000", RELEASE_ID: releaseId },
}] };
