import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { devtools } from "@tanstack/devtools-vite";

// Note: Vitest configuration is in vitest.config.ts
// This separation is required for React 19 compatibility with TanStack Start
const config = defineConfig({
  plugins: [
    devtools(
      process.env.PLAYWRIGHT_E2E === "1"
        ? {
            // Playwright starts its own Vite dev server; the devtools event bus
            // binds a fixed port that conflicts with another local `vite dev`.
            eventBusConfig: { enabled: false },
          }
        : {}
    ),
    nitro({
      // Externalize native modules - they can't be bundled
      rollupConfig: {
        external: ["better-sqlite3"],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
