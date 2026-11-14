import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  plugins: mode === "test" ? [] : [react(), tailwindcss()],
  test: {
    name: "ui",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    isolate: true
  }
}))
