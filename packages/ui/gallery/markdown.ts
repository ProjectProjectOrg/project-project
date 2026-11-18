import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { runInNewContext } from "node:vm"

import type { Plugin, ViteDevServer } from "vite"

type Source = Readonly<{
  kind: string
  name: string
  href?: string
  note?: string
}>

type Meta = Readonly<{
  title: string
  group: string
  description?: string
  sources?: ReadonlyArray<Source>
}>

type MarkdownPage = Readonly<{ path: string; meta: Meta; markdown: string }>

const LIBRARY: Readonly<Record<string, string>> = {
  "base-ui": "Base UI",
  shadcn: "shadcn/ui",
  fluid: "Fluid Functionalism",
  own: "ProjectProject"
}

const META_PATTERN = /export const meta = (\{[\s\S]*?\n\});?\n/
const DEMO_PATTERN = /^<Demo\s+([\s\S]*?)\/>/gm

const listMdx = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return listMdx(full)
    return entry.endsWith(".mdx") ? [full] : []
  })

const attribute = (attributes: string, name: string) =>
  new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1]

const sourceLine = (source: Source) => {
  const label = `${LIBRARY[source.kind] ?? source.kind} ${source.name}`
  const linked =
    source.href === undefined ? label : `[${label}](${source.href})`
  return source.note === undefined
    ? `- ${linked}`
    : `- ${linked} (${source.note})`
}

const readMeta = (raw: string): Meta | null => {
  const metaMatch = META_PATTERN.exec(raw)
  if (metaMatch?.[1] === undefined) return null
  return runInNewContext(`(${metaMatch[1]})`) as Meta
}

const slugOf = (docsRoot: string, file: string) =>
  relative(docsRoot, file).replace(/(\/page)?\.mdx$/, "")

function toMarkdown(file: string, docsRoot: string): MarkdownPage | null {
  const raw = readFileSync(file, "utf8")
  const meta = readMeta(raw)
  if (meta === null) return null
  const slug = slugOf(docsRoot, file)
  const pageDir = file.replace(/\/[^/]+\.mdx$/, "")
  const body = raw
    .replace(META_PATTERN, "")
    .replace(DEMO_PATTERN, (match: string, attributes: string) => {
      const name = attribute(attributes, "name") ?? ""
      const title = attribute(attributes, "title") ?? name
      const demoFile = join(pageDir, "demos", `${name}.tsx`)
      if (!existsSync(demoFile)) return match
      const source = readFileSync(demoFile, "utf8")
      return `**Demo: ${title}**\n\n\`\`\`tsx\n${source.trimEnd()}\n\`\`\``
    })
    .trim()
  const header = [
    `# ${meta.title}`,
    meta.description,
    meta.sources === undefined
      ? undefined
      : `Built on:\n\n${meta.sources.map(sourceLine).join("\n")}`
  ].filter((part) => part !== undefined)
  return {
    path: slug === "introduction" ? "/" : `/${slug}`,
    meta,
    markdown: `${[...header, body].join("\n\n")}\n`
  }
}

const markdownPathOf = (path: string) =>
  path === "/" ? "/index.md" : `${path}.md`

function llmsIndex(pages: ReadonlyArray<MarkdownPage>) {
  const lines = pages.map(
    (page) =>
      `- [${page.meta.title}](${markdownPathOf(page.path)})${
        page.meta.description === undefined ? "" : `: ${page.meta.description}`
      }`
  )
  return `# ProjectProject UI\n\n> The design-system primitives in @pp/ui. Every page is available as Markdown.\n\n${lines.join("\n")}\n`
}

export function markdownPages(docsRoot: string): Plugin {
  const load = () =>
    listMdx(docsRoot)
      .map((file) => toMarkdown(file, docsRoot))
      .filter((page): page is MarkdownPage => page !== null)
      .toSorted(
        (a, b) =>
          Number(a.path !== "/") - Number(b.path !== "/") ||
          a.meta.title.localeCompare(b.meta.title)
      )

  return {
    name: "pp-gallery-markdown",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "/").split("?")[0] ?? "/"
        const wantsMarkdown = (req.headers.accept ?? "").includes(
          "text/markdown"
        )
        if (!wantsMarkdown && url !== "/llms.txt" && !url.endsWith(".md"))
          return next()
        const pages = load()
        if (url === "/llms.txt") {
          res.setHeader("Content-Type", "text/plain; charset=utf-8")
          res.end(llmsIndex(pages))
          return
        }
        const page = pages.find(
          (candidate) =>
            markdownPathOf(candidate.path) === url ||
            (wantsMarkdown && candidate.path === url)
        )
        if (page === undefined) return next()
        res.setHeader("Content-Type", "text/markdown; charset=utf-8")
        res.end(page.markdown)
      })
    },
    generateBundle() {
      const pages = load()
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: llmsIndex(pages)
      })
      for (const page of pages)
        this.emitFile({
          type: "asset",
          fileName: markdownPathOf(page.path).slice(1),
          source: page.markdown
        })
    }
  }
}

const PAGES_ID = "virtual:gallery-pages"
const RESOLVED_PAGES_ID = `\0${PAGES_ID}`

// Every page's meta, read from the .mdx source on the server, so the sidebar
// and search list all pages without loading any of them.
export function pageIndex(docsRoot: string): Plugin {
  const source = () =>
    `export default ${JSON.stringify(
      listMdx(docsRoot).flatMap((file) => {
        const meta = readMeta(readFileSync(file, "utf8"))
        return meta === null ? [] : [{ slug: slugOf(docsRoot, file), meta }]
      })
    )}`
  let last = ""
  const refresh = (server: ViteDevServer, file: string) => {
    if (!file.endsWith(".mdx")) return
    const next = source()
    if (next === last) return
    last = next
    const { moduleGraph } = server.environments.client
    const module = moduleGraph.getModuleById(RESOLVED_PAGES_ID)
    if (module !== undefined) moduleGraph.invalidateModule(module)
    server.ws.send({ type: "full-reload" })
  }
  return {
    name: "pp-gallery-pages",
    resolveId: (id) => (id === PAGES_ID ? RESOLVED_PAGES_ID : undefined),
    load(id) {
      if (id !== RESOLVED_PAGES_ID) return undefined
      last = source()
      return last
    },
    configureServer(server) {
      // docs/ sits outside the gallery's root; watch it so new pages and
      // demos show up without a restart.
      server.watcher.add(docsRoot)
      for (const event of ["add", "change", "unlink"] as const)
        server.watcher.on(event, (file) => refresh(server, file))
    }
  }
}
