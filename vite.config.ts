/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Static, single-page game. `base: "./"` keeps the dist bundle relocatable
// (serve from any subfolder over a local HTTP server).
export default defineConfig({
  base: "./",
  server: {
    // Loopback by default. Use `npm run dev -- --host` if a WSL2/VM setup
    // cannot reach localhost, but know that --host exposes the dev server to
    // the local network.
    host: "127.0.0.1",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
