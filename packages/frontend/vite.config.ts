import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Why this config (not TanStack Start)?
// ---------------------------------------------------------------------------
// PROJECTPROJECT.md calls for "TanStack Start (SPA mode)". TanStack Start's
// value-add over plain @tanstack/react-router is server-side rendering and
// server functions — neither of which we use, since ProjectProject has a dedicated
// Effect backend handling all server logic. We use @tanstack/react-router
// + Vite + React directly. Every API used in the spec's frontend examples
// (createFileRoute, redirect, Outlet, Link) lives in @tanstack/react-router
// itself, so the lessons translate identically. If a future chapter needs
// Start specifically, we can add it then.

export default defineConfig({
  // `@/...` resolves to `src/...`. Mirrors the `paths` entry in tsconfig.json
  // so types and runtime agree. Reach for relative imports only when staying
  // inside a tightly co-located module (e.g. a component pulling its sibling
  // styles); reach for `@/` when crossing top-level concerns (atoms, services,
  // routes).
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  plugins: [
    // Generates packages/frontend/src/routeTree.gen.ts from files in src/routes/
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    // The frontend dev server proxies API calls to the backend so that the
    // browser sees a single origin. This sidesteps every cross-origin cookie
    // headache (SameSite, credentials, preflight) — Better Auth's session
    // cookie set on a `:3000` response comes back to the browser looking
    // exactly like a same-origin cookie, because the response was served
    // through `:5173`.
    //
    // Backend owns the `/api` namespace natively — it serves `/api/me`,
    // `/api/health`, `/api/auth/*`. So this proxy is a pure forwarder, no
    // path rewriting. `HttpApiClient` on the frontend uses baseUrl `/api`,
    // browser hits `:5173/api/me`, Vite forwards to `:3000/api/me`, and the
    // backend's HttpRouter dispatches the same path it would for a direct curl.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
})
