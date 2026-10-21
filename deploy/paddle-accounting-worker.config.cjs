const path = require('node:path');
const root = path.resolve(__dirname,'..');
module.exports = { apps: [{ name: 'motionflow-accounting',cwd: root,
  script: 'scripts/paddle-accounting-worker.mjs',node_args: [`--env-file=${path.join(root,'.env')}`],
  instances: 1,exec_mode: 'fork',autorestart: true,restart_delay: 5000,max_memory_restart: '256M',time: true,
  env: { NODE_ENV: 'production' },
}] };
