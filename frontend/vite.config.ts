import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  // `@/` es el atajo que usan los componentes que llegan por el CLI de shadcn
  // (Bklit, Kokonut UI). Espejo en tsconfig.json → `paths`.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          // Bklit: visx y d3. Sólo lo cargan las vistas con gráficos.
          charts: ["@visx/scale", "@visx/shape", "@visx/curve", "@visx/responsive", "d3-array", "d3-shape"],
          icons: ["@tabler/icons-react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
