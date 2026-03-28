import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        // Sequel brand palette
        brand: {
          50: "#F5F0FF",
          100: "#EDE5FF",
          200: "#D4C4FE",
          300: "#B197FC",
          400: "#9061F9",
          500: "#7C3AED",
          600: "#6D28D9",
          700: "#5B21B6",
          800: "#4C1D95",
          900: "#3B0764",
        },
        // Dark sidebar
        sidebar: {
          bg: "#0F0A1A",
          hover: "#1A1228",
          border: "#2A2040",
          text: "#A09CB0",
          active: "#7C3AED",
        },
        // Surfaces
        surface: {
          DEFAULT: "#FAFAFE",
          card: "#FFFFFF",
          raised: "#F8F6FC",
        },
        // Text
        heading: "#1A1025",
        body: "#6B6680",
        muted: "#9E99AE",
        // Borders
        border: {
          DEFAULT: "#E8E5F0",
          light: "#F0EDF6",
        },
      },
      boxShadow: {
        "card": "0 1px 3px rgba(124, 58, 237, 0.04), 0 1px 2px rgba(124, 58, 237, 0.06)",
        "card-hover": "0 4px 12px rgba(124, 58, 237, 0.08), 0 2px 4px rgba(124, 58, 237, 0.04)",
        "modal": "0 20px 60px rgba(15, 10, 26, 0.2), 0 8px 20px rgba(124, 58, 237, 0.08)",
      },
      borderRadius: {
        "card": "8px",
        "modal": "12px",
      },
    },
  },
  plugins: [],
};
export default config;
