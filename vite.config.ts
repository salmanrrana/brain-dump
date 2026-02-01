import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Note: Vitest configuration is in vitest.config.ts
// This separation is required for React 19 compatibility with TanStack Start
const config = defineConfig({
  plugins: [
    devtools(),
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
  build: {
    rollupOptions: {
      external: ["better-sqlite3"],
    },
  },
  ssr: {
    noExternal: [],
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
});

export default config;
