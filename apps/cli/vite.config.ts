import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "cli",
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
