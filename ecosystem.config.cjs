/** PM2 app for production — use a stable name, not numeric id (`pm2 reload motionflow`). */
module.exports = {
  apps: [
    {
      name: "motionflow",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
