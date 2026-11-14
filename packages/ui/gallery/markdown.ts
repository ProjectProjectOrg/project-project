import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { runInNewContext } from "node:vm"

import type { Plugin } from "vite"

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

const META_PATTERN = /export const meta = (\{[\s\S]*?\n\})\n/
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

function toMarkdown(file: string, docsRoot: string): MarkdownPage | null {
  const raw = readFileSync(file, "utf8")
  const metaMatch = META_PATTERN.exec(raw)
  if (metaMatch?.[1] === undefined) return null
  const meta = runInNewContext(`(${metaMatch[1]})`) as Meta
  const slug = relative(docsRoot, file).replace(/(\/page)?\.mdx$/, "")
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
