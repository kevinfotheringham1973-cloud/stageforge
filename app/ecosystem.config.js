// Only one process: the Cloudflare Tunnel (stageforge-config.yml) forwards
// stageforge.pmopassport.co.uk to localhost:3001, so that's the port that
// matters — it must run a real production build (`next start`), not `next
// dev`. A prior separate "stageforge-prod" process on the default port was
// removed: nothing routed to it, so it was never actually serving traffic.
module.exports = {
  apps: [
    {
      name: "stageforge-tunnel",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: "C:\\Projects\\StageForge\\app",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",
    },
  ],
};
