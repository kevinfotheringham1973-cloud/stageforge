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
        flag: "#A66A1E",
        rule: "#CBD1C8",
        ok: "#3F7D5C",
        warn: "#B8862B",
        risk: "#B0473C",
      },
    },
  },
  plugins: [],
} satisfies Config;
