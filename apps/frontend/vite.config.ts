import path from "node:path"
import { fileURLToPath } from "node:url"

import { paraglideVitePlugin } from "@inlang/paraglide-js"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const packages = (names: ReadonlyArray<string>) =>
  new RegExp(
    `[\\\\/]node_modules[\\\\/](?:${names.map((name) => name.replace("/", "[\\\\/]")).join("|")})[\\\\/]`
  )

const chunkGroups = [
  { name: "vendor-react", test: packages(["react", "react-dom", "scheduler"]) },
  {
    name: "vendor-router",
    test: packages([
      "@tanstack/react-router",
      "@tanstack/router-core",
      "@tanstack/history",
      "@tanstack/store",
      "@tanstack/react-store"
    ])
  },
  { name: "vendor-effect", test: packages(["effect", "@effect/atom-react"]) },
  { name: "i18n", test: /[\\/]src[\\/]paraglide[\\/]/ },
  {
    name: "icons",
    test: packages(["@hugeicons/react", "@hugeicons/core-free-icons"])
  }
]

export default defineConfig(({ mode }) => ({
  root: __dirname,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  publicDir: path.resolve(__dirname, "src/public"),
  build: {
    chunkImportMap: true,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: chunkGroups },
        minifyInternalExports: false
      }
    }
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: mode === "production" ? "^dev\\." : undefined
    }),
    react({ compiler: { target: "19" } }),
    tailwindcss(),
    paraglideVitePlugin({
      project: path.resolve(__dirname, "project.inlang"),
      outdir: path.resolve(__dirname, "src/paraglide")
    })
  ],
  server: {
    port: 5173,
    allowedHosts: process.env.AGENT_PUBLIC_URL
      ? [new URL(process.env.AGENT_PUBLIC_URL).hostname]
      : [],
    proxy: {
      "/api": {
        target:
          process.env.AGENT_API_TARGET ??
          process.env.JIRA_BROWSER_API_TARGET ??
          "http://localhost:3000",
        changeOrigin: true
      },
      "/mcp": {
        target:
          process.env.AGENT_API_TARGET ??
          process.env.JIRA_BROWSER_API_TARGET ??
          "http://localhost:3000",
        changeOrigin: true
      },
      "/.well-known/": {
        target:
          process.env.AGENT_API_TARGET ??
          process.env.JIRA_BROWSER_API_TARGET ??
          "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
}))
