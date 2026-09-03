import { defineConfig } from "@playwright/test";

// Smoke test for the actual packaged desktop app (dist/win-unpacked/
// StageForge.exe) -- distinct from app/'s own test:desktop suite, which
// only ever exercises the Next.js app logic against `next dev` and has
// never once touched the Electron shell or the packaged artifact. Every
// packaging-layer bug so far (the appx read-only node_modules crash,
// the "app" vs "nextapp" resource-folder collision, the half-copied
// portable-build race) shipped without any test catching it -- this is
// meant to close that gap, not duplicate test:desktop's functional
// coverage.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A cold userData profile does a full embedded-Postgres init +
  // migrate + seed on first launch ("this can take a minute or two the
  // first time" per main.js's own splash text) -- generous headroom for
  // that, not because a healthy run is expected to take this long.
  timeout: 240_000,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
