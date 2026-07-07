import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#22c55e",
          500: "#16a34a",
          600: "#15803d",
          700: "#166534",
          800: "#14532d",
          900: "#052e16",
        },
        amber: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        coral: {
          50: "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
        },
        // Tips 13 "betting coupon" redesign tokens (design_handoff_tips13_redesign)
        paper: {
          DEFAULT: "#f5f1e6",
          deep: "#eae5d6",
        },
        surface: {
          DEFAULT: "#fffdf8",
          coupon: "#fffdf6",
        },
        ink: {
          DEFAULT: "#221f18",
          secondary: "#443f33",
          tertiary: "#5d5849",
        },
        muted: {
          DEFAULT: "#96907e",
          faint: "#b6ae97",
          ghost: "#c6bfa9",
        },
        line: {
          card: "#e8e1cd",
          divider: "#efe9d8",
          hairline: "#f4efe0",
          pick: "#ddd5c0",
          tear: "#ddd5c0",
        },
        brand: {
          DEFAULT: "#17703c",
          pressed: "#0e4423",
          text: "#125c31",
          tint: "#e9f1e5",
          tintBorder: "#cfdccb",
          tintBorder2: "#d5e0cf",
        },
        signal: {
          DEFAULT: "#c23a2c",
          soft: "#f8e9e4",
        },
        gold: "#b07c15",
        info: {
          DEFAULT: "#3a6ea5",
          soft: "#e7eef6",
        },
        "result-ink": "#2e2a20",
        rank: {
          1: "#b07c15",
          2: "#9a9483",
          3: "#a06b30",
          4: "#c6bfa9",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "sans-serif"],
        body: ['"Outfit"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      borderRadius: {
        phone: "22px",
        card: "16px",
        "card-sm": "14px",
      },
      boxShadow: {
        card: "0 2px 6px rgba(60,50,20,.07)",
        screen: "0 4px 18px rgba(60,50,20,.14)",
        "btn-primary": "0 2px 0 #0e4423",
        "submit-bar": "0 -3px 10px rgba(60,50,20,.06)",
      },
    },
  },
  plugins: [],
};

export default config;
