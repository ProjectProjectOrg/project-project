import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: ["apps/*/vite.config.ts", "packages/*/vite.config.ts"]
  }
})
