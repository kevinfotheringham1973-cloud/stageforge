// What's actually deployed, for support/debugging -- "what version are
// you running" is the first question anyone troubleshooting a live
// Trust deployment will ask. Deliberately NOT a semver number: nothing
// in this repo bumps package.json's version (it's sat at 0.1.0 since
// the start), so a fake-looking version that never changes would be
// worse than no version at all. The git commit is the real, honest
// answer to "what's running."
//
// Computed once per server process (module-level, like instrumentation.ts's
// cron registration) rather than per-request -- git doesn't change
// while the process is up. Falls back to "unknown" rather than crashing
// if .git isn't present (e.g. a future container-based deploy that
// doesn't copy it) -- same graceful-degradation pattern as the
// SharePoint/Resend integrations elsewhere in this codebase.
import { execSync } from "child_process";

function readGitInfo(): { commitSha: string; commitDate: string } {
  try {
    const commitSha = execSync("git rev-parse --short HEAD", { cwd: process.cwd() }).toString().trim();
    const commitDate = execSync("git log -1 --format=%cI", { cwd: process.cwd() }).toString().trim();
    return { commitSha, commitDate };
  } catch {
    return { commitSha: "unknown", commitDate: "unknown" };
  }
}

const gitInfo = readGitInfo();

export function getBuildInfo() {
  return {
    commitSha: gitInfo.commitSha,
    commitDate: gitInfo.commitDate,
    nodeVersion: process.version,
    nextVersion: require("next/package.json").version as string,
    reactVersion: require("react/package.json").version as string,
    prismaClientVersion: require("@prisma/client/package.json").version as string,
  };
}
