import { defineConfig } from "drizzle-kit";
import { homedir } from "os";
import { join } from "path";

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: join(homedir(), ".brain-dump", "brain-dump.db"),
  },
});
