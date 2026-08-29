// Tears down exactly what global-setup.ts started. Kills by the exact
// PIDs it recorded -- never a broad `taskkill /IM node.exe`, which has
// twice taken down the real live site as collateral damage in manual
// sessions (see the project's own "never broad taskkill" lesson).
import { execSync } from "child_process";
import fs from "fs";
import { STATE_FILE } from "./constants";

function killTree(pid: number) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`);
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Already exited -- fine.
  }
}

export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as {
    pgPid: number;
    serverPid: number;
    scratch: string;
  };
  killTree(state.serverPid);
  killTree(state.pgPid);
  fs.rmSync(state.scratch, { recursive: true, force: true });
}
