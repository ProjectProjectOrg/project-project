import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

// Why this config (not TanStack Start)?
// ---------------------------------------------------------------------------
// PROJECTPROJECT.md calls for "TanStack Start (SPA mode)". TanStack Start's
// value-add over plain @tanstack/react-router is server-side rendering and
// server functions — neither of which we use, since Markmate has a dedicated
// Effect backend handling all server logic. We use @tanstack/react-router
// + Vite + React directly. Every API used in the spec's frontend examples
// (createFileRoute, redirect, Outlet, Link) lives in @tanstack/react-router
// itself, so the lessons translate identically. If a future chapter needs
// Start specifically, we can add it then.

export default defineConfig({
  plugins: [
    // Generates packages/frontend/src/routeTree.gen.ts from files in src/routes/
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  server: {
    port: 5173,
    // The frontend dev server proxies API calls to the backend.
    // The backend listens on :3000; HttpApiClient on the frontend uses
    // baseUrl: "/api", so "/api/health" → "http://localhost:3000/health".
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
})
