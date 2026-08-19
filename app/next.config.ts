import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev-tools indicator (bottom-left "N" badge) is
  // dev-mode-only chrome, not app UI — with the app now shared
  // externally via the Cloudflare tunnel, it reads as a visual bug
  // to anyone viewing it, so it's off.
  devIndicators: false,
};

export default nextConfig;
