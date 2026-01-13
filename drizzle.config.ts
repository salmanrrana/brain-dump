import { defineConfig } from "drizzle-kit";
import { getDatabasePath } from "./src/lib/xdg";

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(),
  },
});
