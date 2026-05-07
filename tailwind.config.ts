import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:   { DEFAULT: "#0A2342", 50: "#14305C", 100: "#1F2A44" },
        orange: { DEFAULT: "#ED7100", 100: "#FF8C29" },
        ink:    "#050A18",
        card:   "#0B1428",
        line:   "#1F2A44",
        soft:   "#6E7A8A",
        good:   "#10B981",
        warn:   "#F59E0B",
        bad:    "#EF4444",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
