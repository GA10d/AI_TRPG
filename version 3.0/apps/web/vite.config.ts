import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(currentDir, "../..");

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: "127.0.0.1",
    port: 4317,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4316",
        changeOrigin: true
      },
      "/video": {
        target: "http://127.0.0.1:4316",
        changeOrigin: true
      }
    },
    fs: {
      allow: [
        repoRoot
      ]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
