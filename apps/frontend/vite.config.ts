import path from "node:path"
import { fileURLToPath } from "node:url"

import { paraglideVitePlugin } from "@inlang/paraglide-js"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const domTests = [
  "src/features/*/hooks/**/*.test.{ts,tsx}",
  "src/features/attachments/atoms/attachments.test.ts",
  "src/features/editor/components/LexicalEditor.test.ts",
  "src/features/editor/lexical/**/*.test.ts",
  "src/features/everhour/components/RunningTimerIndicator.test.ts",
  "src/features/github/components/ticket-git/TicketStack.test.tsx",
  "src/features/projects/forms/project-icon/useIconDraft.test.ts",
  "src/features/projects/lib/bannerRenderCache.test.ts",
  "src/features/projects/lib/imageCompression.test.ts",
  "src/features/projects/lib/imagePreload.test.ts",
  "src/features/tickets/components/ticket-list/search.test.tsx",
  "src/features/tickets/components/ticket-list/sectionCollapse.test.ts",
  "src/features/tickets/components/ticket-list/toolbar/counts.test.tsx",
  "src/features/tickets/components/ticket-list/useTicketPreview.test.ts",
  "src/features/tickets/components/ticket-page/descriptionTemplates.test.ts",
  "src/features/tickets/components/ticket-page/useTemplateSwap.test.ts",
  "src/hooks/**/*.test.{ts,tsx}",
  "src/lib/form.test.ts",
  "src/lib/keepInPlace.test.ts",
  "src/routes/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/-routeReads.test.ts"
]

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
    test: packages(["lucide-react"])
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
    ...(mode === "test"
      ? []
      : [
          tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routeFileIgnorePattern:
              mode === "production" ? "^dev\\." : undefined
          })
        ]),
    react({ compiler: mode === "test" ? false : { target: "19" } }),
    ...(mode === "test" ? [] : [tailwindcss()]),
    paraglideVitePlugin({
      project: path.resolve(__dirname, "project.inlang"),
      outdir: path.resolve(__dirname, "src/paraglide"),
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
      cookieName: "pp_locale",
      cookieMaxAge: 60 * 60 * 24 * 365,
      emitTsDeclarations: true
    })
  ],
  test: {
    name: "frontend",
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: domTests,
          environment: "node",
          isolate: true
        }
      },
      {
        test: {
          name: "dom",
          include: domTests,
          environment: "jsdom",
          pool: "forks",
          isolate: true,
          execArgv: ["--no-experimental-webstorage"],
          environmentOptions: { jsdom: { url: "http://localhost/" } }
        }
      }
    ]
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.JIRA_BROWSER_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true
      },
      "/mcp": {
        target: process.env.JIRA_BROWSER_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true
      },
      "/.well-known/": {
        target: process.env.JIRA_BROWSER_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
}))
