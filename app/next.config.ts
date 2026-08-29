import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop packaging (electron/prepare-resources.js) stages this
  // output instead of the whole app + full node_modules -- traces the
  // real runtime import graph down to just what the standalone
  // server.js actually needs, instead of shipping devDependencies
  // (typescript, eslint, tailwindcss...) and the full untrimmed
  // node_modules tree.
  //
  // Gated behind an env var, NOT unconditional -- this file is shared
  // by the live tunnel-hosted server too (this app/ directory IS the
  // live-serving directory, see the deploy-topology notes), which runs
  // plain `next start`, and Next's own warning is not a bluff: "next
  // start does not work with output: standalone" broke Auth.js's
  // verify-request action specifically (the "check your email" page
  // after requesting a magic link) -- found live, 29 Aug 2026, as a
  // real user-facing "can't log in" report, some hours after this was
  // unconditionally turned on for the desktop build. Set
  // STAGEFORGE_DESKTOP_BUILD=1 when running `npm run build` here for a
  // desktop packaging pass (see electron/prepare-resources.js's own
  // check for this output existing); plain `npm run build` for the
  // live server must NOT set it.
  output: process.env.STAGEFORGE_DESKTOP_BUILD === "1" ? "standalone" : undefined,
  // The floating dev-tools indicator (bottom-left "N" badge) is
  // dev-mode-only chrome, not app UI — with the app now shared
  // externally via the Cloudflare tunnel, it reads as a visual bug
  // to anyone viewing it, so it's off.
  devIndicators: false,
  // Without this, Next dev blocks HMR/dev-resource requests that
  // arrive from any origin other than localhost — the browser's dev
  // client can't hold a working HMR connection through the tunnel
  // domain, and repeatedly falls back to full page reloads, which
  // wipes in-progress form input (e.g. typing on /projects/new). See
  // the "Blocked cross-origin request" warnings this produced in the
  // dev server log. 21 Aug 2026.
  allowedDevOrigins: ["stageforge.pmopassport.co.uk"],
  // forbidden() (used by admin-only pages like /team, /compliance-rules)
  // needs this on to render a clear "you don't have access" message with
  // a real 403 status, instead of the generic 404 not-found page —
  // otherwise a permissions problem looks indistinguishable from a typo
  // in the URL, which isn't an honest message for the target audience.
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
