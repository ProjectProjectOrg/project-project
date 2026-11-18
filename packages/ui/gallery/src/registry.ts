import type { MDXContent } from "mdx/types"
import type { ComponentType } from "react"
import pageIndex from "virtual:gallery-pages"

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

export type Loadable<T> = Readonly<{ load: () => Promise<T> }>

// Loads once. The promise is marked fulfilled the way React's use() reads it,
// so a page or demo that has loaded renders at once instead of suspending.
const loadable = <T>(load: () => Promise<T>) => {
  let promise: Promise<T> | undefined
  return {
    load: () => {
      if (promise !== undefined) return promise
      const started = load()
      promise = started
      void started.then((value) =>
        Object.assign(started, { status: "fulfilled", value })
      )
      return started
    }
  }
}

export type Page = Readonly<{
  slug: string
  path: string
  meta: PageMeta
  Content: Loadable<MDXContent>
}>

export type Demo = Readonly<{
  id: string
  page: string
  name: string
  Component: Loadable<ComponentType>
  source: Loadable<string>
}>

const DOCS_ROOT = "../../docs/"
const GROUP_ORDER = ["Design system", "Primitives", "Patterns", "Editor"]

const pageModules = import.meta.glob<MDXContent>("../../docs/**/*.mdx", {
  import: "default"
})
const demoModules = import.meta.glob<ComponentType>(
  "../../docs/**/demos/*.tsx",
  { import: "default" }
)
const demoSources = import.meta.glob<string>("../../docs/**/demos/*.tsx", {
  query: "?raw",
  import: "default"
})

const relative = (file: string) => file.slice(DOCS_ROOT.length)

const groupRank = (group: string) => {
  const rank = GROUP_ORDER.indexOf(group)
  return rank === -1 ? GROUP_ORDER.length : rank
}

const missing = (file: string) => () =>
  Promise.reject(new Error(`No module at ${file}`))

export const demos: ReadonlyMap<string, Demo> = new Map(
  Object.entries(demoModules).map(([file, load]) => {
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
        Component: loadable(load),
        source: loadable(demoSources[file] ?? missing(file))
      }
    ]
  })
)

const demosOf = (slug: string) =>
  [...demos.values()].filter((demo) => demo.page === slug)

const pageFile = (slug: string) =>
  [`${DOCS_ROOT}${slug}/page.mdx`, `${DOCS_ROOT}${slug}.mdx`].find(
    (file) => file in pageModules
  ) ?? ""

// A page counts as loaded once its demos have too, so it never shows with
// empty demo frames that fill in one by one.
export const pages: ReadonlyArray<Page> = pageIndex
  .map(({ slug, meta }) => {
    const file = pageFile(slug)
    return {
      slug,
      path: slug === "introduction" ? "/" : `/${slug}`,
      meta,
      Content: loadable(async () => {
        const [Content] = await Promise.all([
          (pageModules[file] ?? missing(file))(),
          ...demosOf(slug).map((demo) => demo.Component.load())
        ])
        return Content
      })
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

export const pageByPath = (path: string) =>
  pages.find((page) => page.path === path)

export const markdownPathOf = (path: string) =>
  path === "/" ? "/index.md" : `${path}.md`

const DEMO_PREFIX = "/demo/"

export const demoIdOf = (path: string) =>
  path.startsWith(DEMO_PREFIX) ? path.slice(DEMO_PREFIX.length) : undefined

// Everything a path needs before it can show in full: a page with its demos,
// or a lone demo.
export const preloadPath = async (path: string) => {
  const demoId = demoIdOf(path)
  await (
    demoId === undefined
      ? pageByPath(path)?.Content.load()
      : demos.get(demoId)?.Component.load()
  )?.catch(() => undefined)
}
