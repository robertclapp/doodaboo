import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          soft: "rgb(var(--paper-soft) / <alpha-value>)",
          warm: "rgb(var(--paper-warm) / <alpha-value>)",
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
        brutal: "4px 4px 0 0 rgb(var(--ink))",
        "brutal-sm": "2px 2px 0 0 rgb(var(--ink))",
        "brutal-lg": "6px 6px 0 0 rgb(var(--ink))",
      },
      borderWidth: {
        "1.5": "1.5px",
      },
    },
  },
  plugins: [],
};

export default config;
