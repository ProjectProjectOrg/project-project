import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The chapter markdown lives outside this package, in `<repo-root>/docs/`.
// Vite blocks file-system access outside the project root by default, so
// we expand `server.fs.allow` to include the repo root. This is a dev-tool
// app — no production deployment cares about this constraint.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    fs: {
      allow: ["..", "../.."]
    }
  }
})
