import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "shared",
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
