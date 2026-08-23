import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
