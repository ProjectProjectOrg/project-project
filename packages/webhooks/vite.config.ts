import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "webhooks",
    include: ["test/**/*.test.ts"],
    environment: "node"
  }
})
