import mdx from "@mdx-js/rollup"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import remarkGfm from "remark-gfm"
import { defineConfig } from "vite"

import { markdownPages, pageIndex } from "./markdown"

const here = (path: string) => new URL(path, import.meta.url).pathname

export default defineConfig({
  root: here("."),
  plugins: [
    { enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm] }) },
    // The React Compiler, as in the app, so the gallery runs the components
    // the way the app does.
    react({ include: /\.(mdx|tsx?)$/, compiler: { target: "19" } }),
    tailwindcss(),
    markdownPages(here("../docs")),
    pageIndex(here("../docs"))
  ],
  resolve: { alias: { "@gallery": here("./src") } },
  server: {
    port: 6006,
    strictPort: true,
    // Compile every page and demo in the background at start, so the first
    // visit to a page doesn't wait on the React Compiler.
    warmup: { clientFiles: ["./src/main.tsx", "../docs/**/*.{mdx,tsx}"] }
  },
  build: { outDir: here("./dist"), emptyOutDir: true }
})
