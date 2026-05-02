import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"
// Highlight.js ships per-theme CSS files. We import both as inline strings
// and swap which one is applied based on the active UI theme — that way the
// code blocks track light/dark instead of being locked to one palette.
import hljsLight from "highlight.js/styles/github.css?inline"
import hljsDark from "highlight.js/styles/github-dark.css?inline"

// ---------------------------------------------------------------------------
// Discover all chapter markdown files at build time.
// `import.meta.glob` is Vite-specific. With `eager: true` and `query: "?raw"`
// we get a synchronous map of `{ [absolutePath]: rawString }`.
//
// The path glob uses `/` (Vite project root = this package) and walks up
// twice into `<repo-root>/docs/chapters/...`. Anything matching gets bundled.
// ---------------------------------------------------------------------------
const rawFiles = import.meta.glob("/../../docs/chapters/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>

// ---------------------------------------------------------------------------
// Build a structured index out of the raw file map.
//
// Each chapter directory looks like:
//   docs/chapters/02-better-auth-backend/README.md
//   docs/chapters/02-better-auth-backend/exercises/01-auth-tables.md
//   ...
//
// We collapse that into:
//   { id: "02-better-auth-backend",
//     title: "Better Auth on the backend",        // pulled from README's first H1
//     readme: { id, title, content },
//     exercises: [{ id, title, content }, ...] }
// ---------------------------------------------------------------------------
type Doc = { id: string; title: string; content: string }
type Chapter = { id: string; title: string; readme: Doc; exercises: Array<Doc> }

function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+?)\s*$/m)
  if (!match) return fallback
  // Strip leading "Chapter N — " noise so the sidebar reads cleanly.
  return match[1].replace(/^Chapter\s+\d+\s*[—-]\s*/i, "").trim()
}

function buildChapters(): Array<Chapter> {
  const chapterMap = new Map<string, {
    readme?: Doc
    exercises: Map<string, Doc>
  }>()

  for (const [path, content] of Object.entries(rawFiles)) {
    // Path looks like: /<abs>/docs/chapters/02-better-auth-backend/README.md
    //                                             ^chapterId   ^isReadme/exerciseId
    const parts = path.split("/")
    const chaptersIdx = parts.indexOf("chapters")
    if (chaptersIdx < 0) continue
    const chapterId = parts[chaptersIdx + 1]
    if (!chapterId) continue

    if (!chapterMap.has(chapterId)) {
      chapterMap.set(chapterId, { exercises: new Map() })
    }
    const entry = chapterMap.get(chapterId)!

    const isReadme = parts[chaptersIdx + 2] === "README.md"
    if (isReadme) {
      entry.readme = {
        id: "README",
        title: extractTitle(content, chapterId),
        content
      }
      continue
    }

    const isExercise = parts[chaptersIdx + 2] === "exercises"
    if (isExercise) {
      const fileName = parts[chaptersIdx + 3] ?? ""
      const exerciseId = fileName.replace(/\.md$/, "")
      entry.exercises.set(exerciseId, {
        id: exerciseId,
        title: extractTitle(content, exerciseId),
        content
      })
    }
  }

  return Array.from(chapterMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { readme, exercises }]) => ({
      id,
      title: readme ? readme.title : id,
      readme: readme ?? {
        id: "README",
        title: id,
        content: `# ${id}\n\n_No README.md found for this chapter._`
      },
      exercises: Array.from(exercises.values()).sort((a, b) =>
        a.id.localeCompare(b.id)
      )
    }))
}

// ---------------------------------------------------------------------------
// Tiny hash-based router. Routes look like:
//   #/02-better-auth-backend            -> chapter README
//   #/02-better-auth-backend/01-auth-tables -> exercise within that chapter
// ---------------------------------------------------------------------------
type Route = { chapterId: string; exerciseId: string | null } | null

function parseHash(hash: string): Route {
  const stripped = hash.replace(/^#\/?/, "")
  if (!stripped) return null
  const [chapterId, exerciseId] = stripped.split("/")
  if (!chapterId) return null
  return { chapterId, exerciseId: exerciseId ?? null }
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

// ---------------------------------------------------------------------------
// Theme handling.
//
// Three values are tracked: "light", "dark", or "system" (follow the OS).
// The chosen value is persisted in localStorage. The *resolved* theme
// (light or dark) is reflected on <html data-theme="..."> so CSS variables
// can branch on it, and used to pick which hljs stylesheet to inject.
// ---------------------------------------------------------------------------
type ThemePref = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

const THEME_KEY = "chapters-viewer-theme"

function readThemePref(): ThemePref {
  if (typeof window === "undefined") return "system"
  const stored = window.localStorage.getItem(THEME_KEY)
  return stored === "light" || stored === "dark" ? stored : "system"
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

function useTheme(): {
  pref: ThemePref
  resolved: ResolvedTheme
  cycle: () => void
} {
  const [pref, setPref] = useState<ThemePref>(readThemePref)
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === "undefined" ? false : systemPrefersDark()
  )

  // Track OS theme changes so "system" mode updates live.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const resolved: ResolvedTheme =
    pref === "system" ? (systemDark ? "dark" : "light") : pref

  // Reflect the resolved theme on <html> and swap the hljs stylesheet.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved)

    const id = "hljs-theme"
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = id
      document.head.appendChild(style)
    }
    style.textContent = resolved === "dark" ? hljsDark : hljsLight
  }, [resolved])

  // Persist user choice; clear when reverting to system.
  useEffect(() => {
    if (pref === "system") window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, pref)
  }, [pref])

  const cycle = () => {
    // light -> dark -> system -> light
    setPref((p) => (p === "light" ? "dark" : p === "dark" ? "system" : "light"))
  }

  return { pref, resolved, cycle }
}

// ---------------------------------------------------------------------------
// The app.
// ---------------------------------------------------------------------------
export function App() {
  const chapters = useMemo(buildChapters, [])
  const route = useHashRoute()
  const theme = useTheme()

  // Default to the first chapter's README on first load.
  useEffect(() => {
    if (route === null && chapters.length > 0) {
      window.location.hash = `/${chapters[0].id}`
    }
  }, [route, chapters])

  const activeChapter = route
    ? chapters.find((c) => c.id === route.chapterId)
    : undefined
  const activeDoc: Doc | undefined = activeChapter
    ? route?.exerciseId
      ? activeChapter.exercises.find((e) => e.id === route.exerciseId)
      : activeChapter.readme
    : undefined

  // Scroll to top whenever the active doc changes.
  useEffect(() => {
    document.querySelector(".content")?.scrollTo({ top: 0 })
  }, [route?.chapterId, route?.exerciseId])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a href="#/" className="brand">ProjectProject</a>
          <div className="brand-sub">Chapters</div>
          <button
            type="button"
            className="theme-toggle"
            onClick={theme.cycle}
            aria-label={`Theme: ${theme.pref}. Click to change.`}
            title={`Theme: ${theme.pref}`}
          >
            {theme.pref === "light"
              ? "Light"
              : theme.pref === "dark"
                ? "Dark"
                : "System"}
          </button>
        </div>
        <nav>
          {chapters.map((chapter) => {
            const isActiveChapter = route?.chapterId === chapter.id
            return (
              <div key={chapter.id} className="chapter-block">
                <a
                  href={`#/${chapter.id}`}
                  className={
                    "chapter-link" +
                    (isActiveChapter && !route?.exerciseId ? " active" : "")
                  }
                >
                  <span className="chapter-num">{chapter.id.split("-")[0]}</span>
                  <span className="chapter-title">{chapter.title}</span>
                </a>
                {isActiveChapter && chapter.exercises.length > 0 && (
                  <ul className="exercise-list">
                    {chapter.exercises.map((ex) => (
                      <li key={ex.id}>
                        <a
                          href={`#/${chapter.id}/${ex.id}`}
                          className={
                            "exercise-link" +
                            (route?.exerciseId === ex.id ? " active" : "")
                          }
                        >
                          {ex.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <main className="content">
        {activeDoc
          ? (
            <article className="prose">
              <Markdown
                source={activeDoc.content}
                chapterId={activeChapter!.id}
              />
            </article>
          )
          : <div className="empty">Pick a chapter on the left.</div>}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown renderer with link rewriting.
//
// In-repo links use relative paths like `./exercises/01-auth-tables.md` or
// `../../PROJECTPROJECT.md`. We intercept clicks on those and convert into
// hash-route navigation when possible. External links (http/https) are left
// alone but opened in a new tab.
// ---------------------------------------------------------------------------
function Markdown({ source, chapterId }: { source: string; chapterId: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={{
        a({ href, children, ...rest }) {
          if (!href) return <a {...rest}>{children}</a>
          if (href.startsWith("http")) {
            return (
              <a {...rest} href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          }
          // Try to rewrite repo-relative .md links to hash routes.
          const exerciseMatch = href.match(/^\.\/exercises\/(.+?)\.md$/)
          if (exerciseMatch) {
            return (
              <a {...rest} href={`#/${chapterId}/${exerciseMatch[1]}`}>
                {children}
              </a>
            )
          }
          return <a {...rest} href={href}>{children}</a>
        },
        pre({ children, ...rest }) {
          return <CodeBlock {...rest}>{children}</CodeBlock>
        }
      }}
    >
      {source}
    </ReactMarkdown>
  )
}

// Wrapper around <pre> that adds a copy-to-clipboard button. The button sits
// absolutely positioned in the top-right; CSS keeps it visible on hover and
// after a successful copy.
function CodeBlock({ children, ...rest }: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const text = ref.current?.innerText ?? ""
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail in non-secure contexts; ignore.
    }
  }

  return (
    <div className="code-block">
      <button
        type="button"
        className={"copy-btn" + (copied ? " copied" : "")}
        onClick={onCopy}
        aria-label="Copy code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={ref} {...rest}>{children}</pre>
    </div>
  )
}
