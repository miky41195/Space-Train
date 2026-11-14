import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const inTest = Boolean(process.env.VITEST);

// https://vite.dev/config/
export default defineConfig({
  plugins: [sveltekit()],

  // Without the "browser" condition, Vite resolves the server-side build of
  // Svelte and `mount()` does not exist. It goes at the top level: inside `test`
  // it is ignored. The guard keeps the change out of the app build.
  resolve: inTest ? { conditions: ["browser"] } : undefined,

  test: {
    // Two separate environments: starting jsdom for logic-only files too
    // takes the suite from 3 to 24 seconds without checking anything more.
    projects: [
      {
        extends: true,
        test: {
          name: "logic",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.dom.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.ts"],
          setupFiles: ["./src/test-setup.ts"],
        },
      },
    ],
  },

  // Tauri options, applied only by `tauri dev` and `tauri build`
  //
  // 1. prevents Vite from hiding Rust errors
  clearScreen: false,
  // 2. Tauri expects a fixed port and fails if it is taken
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tells Vite not to watch `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
