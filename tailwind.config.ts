import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#171717",
          muted: "#262626",
        },
        paper: {
          DEFAULT: "#fafaf7",
          soft: "#f2f2ed",
          warm: "#e8e8e0",
        },
        accent: {
          DEFAULT: "#ff5c1a",
          lime: "#c4f000",
          blue: "#3b4ae4",
          violet: "#6b4ee4",
        },
        status: {
          backlog: "#737373",
          todo: "#a3a3a3",
          progress: "#f59e0b",
          review: "#6b4ee4",
          done: "#16a34a",
          cancelled: "#525252",
        },
        priority: {
          urgent: "#dc2626",
          high: "#f97316",
          medium: "#eab308",
          low: "#3b82f6",
          none: "#737373",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Inter",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        brutal: "4px 4px 0 0 #0a0a0a",
        "brutal-sm": "2px 2px 0 0 #0a0a0a",
        "brutal-lg": "6px 6px 0 0 #0a0a0a",
      },
      borderWidth: {
        "1.5": "1.5px",
      },
    },
  },
  plugins: [],
};

export default config;
