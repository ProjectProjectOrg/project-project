import type { MDXContent } from "mdx/types"
import type { ComponentType } from "react"

export type SourceKind = "base-ui" | "shadcn" | "fluid" | "own"

export type Source = Readonly<{
  kind: SourceKind
  name: string
  href?: string
  note?: string
}>

export type PageMeta = Readonly<{
  title: string
  group: string
  description?: string
  order?: number
  sources?: ReadonlyArray<Source>
}>

export type Page = Readonly<{
  slug: string
  path: string
  meta: PageMeta
  Content: MDXContent
}>

export type Demo = Readonly<{
  id: string
  page: string
  name: string
  Component: ComponentType
  source: string
}>

type PageModule = Readonly<{ default: MDXContent; meta: PageMeta }>
type DemoModule = Readonly<{ default: ComponentType }>

const DOCS_ROOT = "../../docs/"
const GROUP_ORDER = ["Design system", "Primitives"]

const pageModules = import.meta.glob<PageModule>("../../docs/**/*.mdx", {
  eager: true
})
const demoModules = import.meta.glob<DemoModule>("../../docs/**/demos/*.tsx", {
  eager: true
})
const demoSources = import.meta.glob<string>("../../docs/**/demos/*.tsx", {
  eager: true,
  query: "?raw",
  import: "default"
})

const relative = (file: string) => file.slice(DOCS_ROOT.length)

const groupRank = (group: string) => {
  const rank = GROUP_ORDER.indexOf(group)
  return rank === -1 ? GROUP_ORDER.length : rank
}

export const pages: ReadonlyArray<Page> = Object.entries(pageModules)
  .map(([file, module]) => {
    const slug = relative(file).replace(/(\/page)?\.mdx$/, "")
    return {
      slug,
      path: slug === "introduction" ? "/" : `/${slug}`,
      meta: module.meta,
      Content: module.default
    }
  })
  .toSorted(
    (a, b) =>
      groupRank(a.meta.group) - groupRank(b.meta.group) ||
      (a.meta.order ?? 1) - (b.meta.order ?? 1) ||
      a.meta.title.localeCompare(b.meta.title)
  )

export const groups: ReadonlyArray<
  Readonly<{ name: string; pages: ReadonlyArray<Page> }>
> = [...new Set(pages.map((page) => page.meta.group))].map((name) => ({
  name,
  pages: pages.filter((page) => page.meta.group === name)
}))

export const demos: ReadonlyMap<string, Demo> = new Map(
  Object.entries(demoModules).map(([file, module]) => {
    const [page = "", name = ""] = relative(file)
      .replace(/\.tsx$/, "")
      .split("/demos/")
    const id = `${page}/${name}`
    return [
      id,
      {
        id,
        page,
        name,
        Component: module.default,
        source: demoSources[file] ?? ""
      }
    ]
  })
)

export const pageByPath = (path: string) =>
  pages.find((page) => page.path === path)

export const markdownPathOf = (path: string) =>
  path === "/" ? "/index.md" : `${path}.md`
