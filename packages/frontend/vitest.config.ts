import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@/paraglide/messages": path.resolve(
        __dirname,
        "src/paraglide/messages.js"
      ),
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4
      }
    }
  }
})
