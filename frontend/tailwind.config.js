/** @type {import('tailwindcss').Config} */

// Los nombres de color no llevan valores propios: apuntan a los tokens `gr-*`
// de theme.css. Antes esta config mantenía una paleta paralela y obsoleta
// (#0c0b0e donde el tema decía #07060c, #9b7fc4 donde decía #a98bf0) que ningún
// componente usaba — cuarenta tokens esperando a que alguien escribiera
// `bg-bg-surface` y obtuviera el color equivocado. Ahora una clase utilitaria y
// una `var()` escrita a mano pintan exactamente lo mismo.
//
// Nota: al ser `var()` y no un valor resoluble, los modificadores de opacidad
// (`bg-accent/50`) no funcionan sobre estos nombres. Para transparencias, usa
// `color-mix()` o un token con alfa propio.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--gr-void)",
          primary: "var(--gr-void)",
          surface: "var(--gr-surface)",
          elevated: "var(--gr-surface-raised)",
          overlay: "var(--gr-surface-sunken)",
          deep: "var(--gr-surface-sunken)",
          chrome: "var(--gr-chrome)",
        },
        border: {
          DEFAULT: "var(--gr-edge)",
          strong: "var(--gr-edge-strong)",
          accent: "var(--gr-edge-strong)",
          focus: "var(--gr-edge-focus)",
          glow: "var(--gr-edge-focus)",
          danger: "var(--gr-edge-danger)",
        },
        accent: {
          DEFAULT: "var(--gr-arcane)",
          strong: "var(--gr-arcane-bright)",
          deep: "var(--gr-arcane-deep)",
        },
        purple: {
          main: "var(--gr-arcane)",
          muted: "var(--gr-ink-dim)",
          deep: "var(--gr-arcane-deep)",
        },
        // Recompensa: XP, logros, rachas. Faltaba por completo en esta config.
        gilded: {
          DEFAULT: "var(--gr-gilded)",
          bright: "var(--gr-gilded-bright)",
          deep: "var(--gr-gilded-deep)",
        },
        text: {
          primary: "var(--gr-ink-bright)",
          body: "var(--gr-ink)",
          muted: "var(--gr-ink-dim)",
          faint: "var(--gr-ink-faint)",
        },
        xp: {
          from: "var(--gr-xp-from)",
          to: "var(--gr-xp-to)",
        },
        state: {
          success: "var(--gr-verdigris)",
          "success-bg": "var(--gr-verdigris-deep)",
          warning: "var(--gr-amber)",
          "warning-bg": "var(--gr-amber-deep)",
          danger: "var(--gr-oxblood)",
          "danger-bg": "var(--gr-oxblood-deep)",
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
        display: "var(--gr-font-display)",
        ui: "var(--gr-font-ui)",
        prose: "var(--gr-font-prose)",
        body: "var(--gr-font-ui)",
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
