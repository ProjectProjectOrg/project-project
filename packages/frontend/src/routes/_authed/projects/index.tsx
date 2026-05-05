import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { motion } from "framer-motion"
import { ChevronRight, FolderKanban, Plus } from "lucide-react"
import { createProjectAtom, projectsListAtom } from "@/atoms/projects"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupHint,
  InputGroupInput
} from "@/components/ui/input-group"
import { PageContainer, PageHeader } from "@/components/page"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/relative-time"

export const Route = createFileRoute("/_authed/projects/")({
  component: Projects,
  loader: () => ({
    crumb: { type: "static" as const, label: "Projects", to: "/projects" }
  })
})

function Projects() {
  const list = useAtomValue(projectsListAtom)
  const [creating, setCreating] = useState(false)

  return (
    <PageContainer>
      <PageHeader>
        <h1>Projects</h1>
        <p>Type a name and press Enter to create a project.</p>
      </PageHeader>

      <CreateRow onFocusChange={setCreating} />

      {
        /* Same intent-driven dim pattern as the ticket list: when the user
          is composing a new project the existing list dims to pull focus
          to the input. Pure visual hint — clicks below stay enabled. */
      }
      <motion.div
        animate={{ opacity: creating ? 0.35 : 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {Result.matchWithError(list, {
          onInitial: () => <ListSkeleton />,
          onError: (error) => (
            <ListMessage>Couldn't load projects: {error._tag}</ListMessage>
          ),
          onDefect: (defect) => (
            <ListMessage>Something went wrong: {String(defect)}</ListMessage>
          ),
          onSuccess: ({ value }) =>
            value.length === 0
              ? <EmptyProjects />
              : (
                <ul className="flex flex-col gap-2">
                  {value.map((project) => (
                    <li key={project.slug}>
                      <ProjectRow project={project} />
                    </li>
                  ))}
                </ul>
              )
        })}
      </motion.div>
    </PageContainer>
  )
}

function CreateRow({
  onFocusChange
}: {
  onFocusChange?: (focused: boolean) => void
}) {
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

  // Uses the shared InputGroup primitive — same chrome and leading-addon
  // column alignment as every other "create" input in the app.
  return (
    <form onSubmit={onSubmit}>
      <InputGroup>
        <InputGroupAddon>
          <Plus className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder="New project name…"
          aria-label="New project name"
          disabled={submitting}
          maxLength={120}
        />
        {previewSlug && (
          <InputGroupHint className="hidden sm:inline">
            /{previewSlug}
          </InputGroupHint>
        )}
        {error && (
          <span className="shrink-0 text-xs text-destructive">{error}</span>
        )}
      </InputGroup>
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
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors",
        "hover:bg-accent/40 hover:border-border/80"
      )}
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <FolderKanban className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{project.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          /{project.slug}
        </div>
      </div>
      <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {formatRelative(project.createdAt)}
      </div>
      <ChevronRight
        className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
        strokeWidth={1.75}
      />
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

function EmptyProjects() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="size-5" strokeWidth={1.75} />
      </div>
      <div className="text-sm font-medium">No projects yet</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        Type a name above and press Enter to create your first project.
        Everything is stored as markdown on disk — yours to grep, edit, or feed
        to an AI.
      </p>
    </div>
  )
}
