import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#EEF0EC",
        surface: "#FFFFFF",
        surface2: "#E4E7E1",
        ink: "#1B2422",
        inkmuted: "#56635E",
        accent: "#1F5C63",
        accentsoft: "#DCE7E6",
        // For the "Health" half of the wordmark (layout.tsx/login) --
        // deliberately not NHS's own blue (#005EB8, saturated/bright):
        // that reads as implying NHS ownership, which is exactly what
        // dropping the NHS logo was meant to stop doing (24 Aug 2026).
        // A distinct, more muted blue signals "healthcare" without
        // borrowing NHS's specific brand equity. 5.7:1 contrast on
        // white, comfortably above WCAG AA even at normal text size.
        accentblue: "#2E6B99",
        // Darkened from #A66A1E/#B8862B (21 Aug 2026 accessibility pass) — both
        // sat right at or just under the WCAG AA 4.5:1 text-contrast minimum on
        // white, which these carry at 10-14px throughout (statutory badges,
        // gate/spend warnings). Same hue, now >=4.5:1 in both directions
        // (as text on white, and as white text on the badge background).
        flag: "#A3681D",
        rule: "#CBD1C8",
        ok: "#3F7D5C",
        warn: "#976E23",
        risk: "#B0473C",
      },
    },
  },
  plugins: [],
} satisfies Config;
