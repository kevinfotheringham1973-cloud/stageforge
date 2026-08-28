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
// if .git isn't present -- the desktop build (electron/) is exactly
// that case: .git is deliberately never copied into its packaged app
// (prepare-resources.js), same graceful-degradation pattern as the
// SharePoint/Resend integrations elsewhere in this codebase.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// prepare-resources.js writes this alongside the packaged app, captured
// from the real repo's .git while it still had access to it -- read
// here as the desktop build's fallback so its About page shows the
// actual commit it was packaged from instead of "unknown" (28 Aug
// 2026 -- this is what lets you check the exe against the live server
// rather than just knowing you can't).
function readDesktopBuildInfo(): { commitSha: string; commitDate: string; packagedAt: string } | null {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "desktop-build-info.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readGitInfo(): { commitSha: string; commitDate: string; packagedAt?: string } {
  try {
    const commitSha = execSync("git rev-parse --short HEAD", { cwd: process.cwd() }).toString().trim();
    const commitDate = execSync("git log -1 --format=%cI", { cwd: process.cwd() }).toString().trim();
    return { commitSha, commitDate };
  } catch {
    return readDesktopBuildInfo() ?? { commitSha: "unknown", commitDate: "unknown" };
  }
}

const gitInfo = readGitInfo();

export function getBuildInfo() {
  return {
    commitSha: gitInfo.commitSha,
    commitDate: gitInfo.commitDate,
    packagedAt: gitInfo.packagedAt ?? null,
    nodeVersion: process.version,
    nextVersion: require("next/package.json").version as string,
    reactVersion: require("react/package.json").version as string,
    prismaClientVersion: require("@prisma/client/package.json").version as string,
  };
}
