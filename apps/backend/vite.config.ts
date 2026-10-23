import { defineConfig } from "vitest/config"

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "backend",
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      ENTITY_MESSAGE_POLL_INTERVAL: "100 millis",
      REFRESH_ASSIGNMENTS_INTERVAL: "100 millis"
    }
  }
})
