module.exports = {
  apps: [
    {
      name: "stageforge-prod",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "C:\\Projects\\StageForge\\app",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",
    },
    {
      name: "stageforge-tunnel",
      script: "node_modules/next/dist/bin/next",
      args: "dev -p 3001",
      cwd: "C:\\Projects\\StageForge\\app",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",
    },
  ],
};
