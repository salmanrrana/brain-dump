import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { devtools } from "@tanstack/devtools-vite";

// better-sqlite3 is a native Node addon. If it ever lands in the browser
// bundle Vite pre-bundles it and it explodes at runtime with the useless
// `TypeError: promisify is not a function`. This plugin intercepts resolution
// in the client environment and replaces these modules with a throw-stub that
// names the offending importer, so the error points at the real leak.
function serverOnlyNativeModules(): Plugin {
  const BLOCKED = new Set(["better-sqlite3", "drizzle-orm/better-sqlite3"]);
  const MARKER = "\0brain-dump:server-only:";
  return {
    name: "brain-dump:block-server-only-in-browser",
    enforce: "pre",
    resolveId(source, importer, options) {
      if (options?.ssr) return null;
      if (!BLOCKED.has(source)) return null;
      return `${MARKER}${source}|${importer ?? "<unknown>"}`;
    },
    load(id) {
      if (!id.startsWith(MARKER)) return null;
      const payload = id.slice(MARKER.length);
      const sep = payload.indexOf("|");
      const pkg = payload.slice(0, sep);
      const importer = payload.slice(sep + 1);
      const message =
        `[brain-dump] Server-only module "${pkg}" was pulled into the browser bundle by "${importer}". ` +
        `This usually means a top-level import or re-export in the client graph reaches core/db.ts or src/lib/db.ts. ` +
        `Move the usage behind a createServerFn handler (or import from a server-only module) instead of re-exporting it from a client-reachable file.`;
      return `throw new Error(${JSON.stringify(message)});`;
    },
  };
}

const config = defineConfig({
  plugins: [
    serverOnlyNativeModules(),
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
  // Keep the browser dep optimizer from eagerly pre-bundling native modules.
  optimizeDeps: {
    exclude: ["better-sqlite3", "drizzle-orm/better-sqlite3"],
  },
  // Native modules must stay external on the SSR side too.
  ssr: {
    external: ["better-sqlite3"],
  },
});

export default config;
