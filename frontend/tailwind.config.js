/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0c0b0e",
          primary: "#0c0b0e",
          surface: "#131217",
          elevated: "#1a1820",
          overlay: "#08070a",
          deep: "#08070a",
        },
        border: {
          DEFAULT: "#26242c",
          strong: "#38353f",
          accent: "#38353f",
          focus: "#7c5fa8",
          glow: "#7c5fa8",
        },
        accent: {
          DEFAULT: "#9b7fc4",
          strong: "#b79ae0",
          deep: "#3a2060",
        },
        purple: {
          main: "#9b7fc4",
          muted: "#8f8b99",
          deep: "#3a2060",
        },
        text: {
          primary: "#e4e2e8",
          body: "#b8b5c0",
          muted: "#8f8b99",
          faint: "#6e6a78",
        },
        xp: {
          from: "#4a2d7a",
          to: "#9b7fc4",
        },
        state: {
          success: "#4a9b6f",
          "success-bg": "#16301f",
          warning: "#c9963f",
          "warning-bg": "#33260d",
          danger: "#d1687e",
          "danger-bg": "#3a141c",
        },
      },
      // Escala única: 5 pasos, piso en 12px. Nada por debajo.
      fontSize: {
        xs: ["12px", { lineHeight: "1.45" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["15px", { lineHeight: "1.55" }],
        lg: ["19px", { lineHeight: "1.35" }],
        xl: ["28px", { lineHeight: "1.15" }],
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        ui: ["Inter", "system-ui", "sans-serif"],
        prose: ["Spectral", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
