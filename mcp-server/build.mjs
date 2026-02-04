import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/index.js",
  sourcemap: true,
  external: ["better-sqlite3"],
  banner: { js: "#!/usr/bin/env node" },
});

await chmod("dist/index.js", 0o755);
console.log("Built mcp-server/dist/index.js");
