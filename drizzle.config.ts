import { defineConfig } from "drizzle-kit";
import { getDatabasePath, ensureDirectoriesSync } from "./src/lib/xdg";

// Ensure XDG directories exist before Drizzle attempts to connect
// This prevents "directory does not exist" errors on first install
ensureDirectoriesSync();

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(),
  },
});
