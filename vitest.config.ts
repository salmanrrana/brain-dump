import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // The React Compiler (babel-plugin-react-compiler) is intentionally NOT enabled here.
  // Tests run on un-compiled components by design — assert user-visible behavior, not the
  // referential identity of compiler-memoized values. Production code is compiled; see
  // vite.config.ts and docs/performance/react-compiler.md.
  plugins: [react()],
  test: {
    exclude: ["**/e2e/**", "**/node_modules/**", "**/integration-tests/**"],
    setupFiles: ["./src/mocks/vitest.setup.ts"],
    environment: "jsdom",
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
