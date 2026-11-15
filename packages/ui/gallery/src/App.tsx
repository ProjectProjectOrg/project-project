import { FileText } from "@pp/ui/icons"
import { Logo, Wordmark } from "@pp/ui/logo"
import { useEffect } from "react"

import { PageContext } from "./context"
import { mdxComponents } from "./mdxComponents"
import { demos, markdownPathOf, pageByPath } from "./registry"
import { usePath } from "./router"
import { Search } from "./Search"
import { Sidebar } from "./Sidebar"
import { Sources } from "./Sources"
import { ThemeSwitch } from "./ThemeSwitch"

const DEMO_PREFIX = "/demo/"

export function App() {
  const path = usePath()
  if (path.startsWith(DEMO_PREFIX))
    return <IsolatedDemo id={path.slice(DEMO_PREFIX.length)} />
  return <Shell path={path} />
}

function Shell({ path }: Readonly<{ path: string }>) {
  const page = pageByPath(path)
  useEffect(() => {
    const link = document.head.querySelector<HTMLLinkElement>(
      'link[rel="alternate"][type="text/markdown"]'
    )
    if (link !== null) link.href = markdownPathOf(path)
  }, [path])
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id !== "")
      document.getElementById(id)?.scrollIntoView({ block: "start" })
  }, [path])
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-5 border-r border-border px-3 pt-6 pb-4">
        <a
          href="/"
          aria-label="ProjectProject UI"
          className="flex h-8 items-center gap-2.5 px-3 text-foreground"
        >
          <Logo className="size-6 leading-none [&>svg]:block" />
          <Wordmark className="h-3.5 leading-none [&>svg]:block" />
          <span
            aria-hidden
            className="h-4 w-px rotate-[20deg] rounded-full bg-muted-foreground/50"
          />
          <span className="text-subtitle leading-none font-semibold text-muted-foreground">
            UI
          </span>
        </a>
        <Search />
        <Sidebar path={path} />
        <ThemeSwitch />
      </aside>
      <main className="min-w-0 flex-1 px-12 pt-14 pb-24">
        <article className="mx-auto max-w-3xl">
          {page === undefined ? (
            <NotFound />
          ) : (
            <PageContext value={page.slug}>
              <header className="mb-10">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-display font-semibold">
                    {page.meta.title}
                  </h1>
                  <a
                    href={markdownPathOf(page.path)}
                    className="mt-1.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-caption text-muted-foreground transition-colors corner-squircle hover:text-foreground"
                  >
                    <FileText className="size-3.5" strokeWidth={2} />
                    View as Markdown
                  </a>
                </div>
                {page.meta.description === undefined ? null : (
                  <p className="mt-3 max-w-prose text-title text-muted-foreground">
                    {page.meta.description}
                  </p>
                )}
                {page.meta.sources === undefined ? null : (
                  <Sources sources={page.meta.sources} />
                )}
              </header>
              <page.Content components={mdxComponents} />
            </PageContext>
          )}
        </article>
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <>
      <h1 className="mb-3 text-display font-semibold">Page not found</h1>
      <p className="text-subtitle text-muted-foreground">
        Pick a component from the sidebar, or search with ⌘K.
      </p>
    </>
  )
}

function IsolatedDemo({ id }: Readonly<{ id: string }>) {
  const demo = demos.get(id)
  return (
    <main className="grid min-h-dvh justify-items-center px-10 pt-14 pb-10">
      {demo === undefined ? (
        <p className="text-body text-destructive">No demo named {id}.</p>
      ) : (
        <demo.Component />
      )}
    </main>
  )
}
