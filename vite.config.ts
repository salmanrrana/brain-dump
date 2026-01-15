import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  plugins: [
    devtools(),
    nitro({
      // Externalize native modules - they can't be bundled
      rollupConfig: {
        external: ['better-sqlite3'],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  test: {
    exclude: ['**/e2e/**', '**/node_modules/**'],
    // MSW setup file for API mocking in tests
    setupFiles: ['./src/mocks/vitest.setup.ts'],
    // Limit workers to prevent memory exhaustion (each worker can use ~4GB)
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },
    // Force clean exit to prevent zombie processes
    teardownTimeout: 5000,
  },
})

export default config
