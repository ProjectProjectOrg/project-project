import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  plugins: mode === "test" ? [] : [react(), tailwindcss()],
  test: {
    isolate: true,
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/editor/**", "src/hooks/**"],
          environment: "node"
        }
      },
      {
        // The editor (Lexical) and hooks need a DOM.
        extends: true,
        test: {
          name: "ui-dom",
          include: ["src/editor/**/*.test.{ts,tsx}", "src/hooks/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["src/editor/test-setup.ts"]
        }
      }
    ]
  }
}))
