import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "access",
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
