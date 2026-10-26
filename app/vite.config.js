import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const inTest = Boolean(process.env.VITEST);

// https://vite.dev/config/
export default defineConfig({
  plugins: [sveltekit()],

  // Senza la condizione "browser", Vite risolve la build server-side di
  // Svelte e `mount()` non esiste. Va al livello principale: dentro `test`
  // viene ignorata. La guardia tiene la modifica fuori dalla build dell'app.
  resolve: inTest ? { conditions: ["browser"] } : undefined,

  test: {
    // Due ambienti separati: avviare jsdom anche per i file di sola logica
    // porta la suite da 3 a 24 secondi senza verificare nulla di più.
    projects: [
      {
        extends: true,
        test: {
          name: "logica",
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

  // Opzioni per Tauri, applicate solo da `tauri dev` e `tauri build`
  //
  // 1. impedisce a Vite di nascondere gli errori di Rust
  clearScreen: false,
  // 2. Tauri pretende una porta fissa e fallisce se occupata
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
      // 3. dice a Vite di non sorvegliare `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
