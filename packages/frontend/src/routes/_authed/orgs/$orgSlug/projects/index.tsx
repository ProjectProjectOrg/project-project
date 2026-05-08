import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Exit } from "effect"
import { useState, type FormEvent } from "react"
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
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/")({
  component: Projects,
  loader: ({ params }) => ({
    crumb: {
      type: "static" as const,
      label: "Projects",
      to: "/orgs/$orgSlug/projects",
      params: { orgSlug: params.orgSlug }
    }
  })
})

function Projects() {
  const { orgSlug } = Route.useParams()
  const list = useAtomValue(projectsListAtom(orgSlug))
  const [creating, setCreating] = useState(false)

  return (
    <PageContainer>
      <PageHeader>
        <h1>{m.projects_page_title()}</h1>
        <p>{m.projects_page_subtitle()}</p>
      </PageHeader>

      <CreateRow orgSlug={orgSlug} onFocusChange={setCreating} />

      {/* Same intent-driven dim pattern as the ticket list: when the user
          is composing a new project the existing list dims to pull focus
          to the input. Pure visual hint — clicks below stay enabled. */}
      <motion.div
        animate={{ opacity: creating ? 0.35 : 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {Result.matchWithError(list, {
          onInitial: () => <ListSkeleton />,
          onError: (error) => (
            <ListMessage>
              {m.projects_list_load_error({ tag: error._tag })}
            </ListMessage>
          ),
          onDefect: (defect) => (
            <ListMessage>
              {m.projects_list_defect({ defect: String(defect) })}
            </ListMessage>
          ),
          onSuccess: ({ value }) =>
            value.length === 0 ? (
              <EmptyProjects />
            ) : (
              <ul className="flex flex-col gap-2">
                {value.map((project) => (
                  <li key={project.slug}>
                    <ProjectRow orgSlug={orgSlug} project={project} />
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
  orgSlug,
  onFocusChange
}: {
  orgSlug: string
  onFocusChange?: (focused: boolean) => void
}) {
  const create = useAtomSet(createProjectAtom(orgSlug), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(createProjectAtom(orgSlug))
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.projects_create_error_fallback()
    : null
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const previewSlug = trimmed ? slugify(trimmed) : ""

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const exit = await create({ name: trimmed })
    if (Exit.isSuccess(exit)) {
      setName("")
    }
  }

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
          placeholder={m.projects_create_name_placeholder()}
          aria-label={m.projects_create_name_aria_label()}
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
  orgSlug,
  project
}: {
  orgSlug: string
  project: { slug: string; name: string; createdAt: Date }
}) {
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug"
      params={{ orgSlug, slug: project.slug }}
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
          className="h-[60px] skeleton rounded-xl border border-border bg-background"
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
      <div className="text-sm font-medium">{m.projects_list_empty()}</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        {m.projects_list_empty_body()}
      </p>
    </div>
  )
}
