import {
  Result,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { FolderKanban, Plus } from "lucide-react"
import { createProjectAtom, projectsListAtom } from "@/atoms/projects"
import { Input } from "@/components/ui/input"
import { PageContainer, PageHeader } from "@/components/page"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authed/projects/")({ component: Projects })

function Projects() {
  const list = useAtomValue(projectsListAtom)

  return (
    <PageContainer>
      <PageHeader>
        <h1>Projects</h1>
        <p>Type a name and press Enter to create a project.</p>
      </PageHeader>

      <CreateRow />

      {Result.matchWithError(list, {
        onInitial: () => <ListSkeleton />,
        onError: (error) => (
          <ListMessage>Couldn't load projects: {error._tag}</ListMessage>
        ),
        onDefect: (defect) => (
          <ListMessage>Something went wrong: {String(defect)}</ListMessage>
        ),
        onSuccess: ({ value }) =>
          value.length === 0 ? (
            <ListMessage>No projects yet.</ListMessage>
          ) : (
            <ul className="flex flex-col gap-2">
              {value.map((project) => (
                <li key={project.slug}>
                  <ProjectRow project={project} />
                </li>
              ))}
            </ul>
          )
      })}
    </PageContainer>
  )
}

function CreateRow() {
  const create = useAtomSet(createProjectAtom)
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const previewSlug = trimmed ? slugify(trimmed) : ""

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await create({ name: trimmed })
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2",
        "ring-offset-background focus-within:ring-2 focus-within:ring-ring"
      )}
    >
      <Plus
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name…"
        aria-label="New project name"
        disabled={submitting}
        className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        maxLength={120}
      />
      {previewSlug && (
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
          /{previewSlug}
        </span>
      )}
      {error && (
        <span className="shrink-0 text-xs text-destructive">{error}</span>
      )}
    </form>
  )
}

function ProjectRow({
  project
}: {
  project: { slug: string; name: string; createdAt: Date }
}) {
  return (
    <Link
      to="/projects/$slug"
      params={{ slug: project.slug }}
      className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-accent/40 hover:border-border/80"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{project.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          /{project.slug}
        </div>
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">
        {formatRelative(project.createdAt)}
      </div>
    </Link>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[60px] animate-pulse rounded-xl border border-border bg-background"
        />
      ))}
    </div>
  )
}

function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60]
]

function formatRelative(date: Date): string {
  const diff = (date.getTime() - Date.now()) / 1000
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) {
      return RELATIVE.format(Math.round(diff / secs), unit)
    }
  }
  return RELATIVE.format(Math.round(diff), "second")
}
