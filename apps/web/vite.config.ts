import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          webauthn: ["@simplewebauthn/browser"]
        }
      }
    }
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 4173)
  },
  preview: {
    port: Number(process.env.WEB_PORT ?? 4173)
  }
});
