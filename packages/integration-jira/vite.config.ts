import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "integration-jira",
    include: ["src/**/*.test.ts"],
    environment: "node",
    isolate: true
  }
})
