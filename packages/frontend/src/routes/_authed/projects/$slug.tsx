import {
  Result,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  useNavigate
} from "@tanstack/react-router"
import {
  useEffect,
  useState,
  type KeyboardEvent
} from "react"
import {
  ArrowLeft,
  FolderKanban,
  MoreHorizontal,
  Trash2
} from "lucide-react"
import {
  deleteProjectAtom,
  projectAtom,
  updateProjectAtom
} from "@/atoms/projects"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  LexicalEditor,
  type SaveStatus
} from "@/components/LexicalEditor"
import { PageContainer, PageHeader } from "@/components/page"

export const Route = createFileRoute("/_authed/projects/$slug")({
  component: ProjectDetail
})

function ProjectDetail() {
  const { slug } = Route.useParams()
  const project = useAtomValue(projectAtom(slug))

  return (
    <PageContainer>
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        All projects
      </Link>

      {Result.matchWithError(project, {
        onInitial: () => <DetailSkeleton />,
        onError: (error) =>
          error._tag === "NotFound" ? (
            <NotFoundCard slug={slug} />
          ) : (
            <ErrorCard message={`Couldn't load project: ${error._tag}`} />
          ),
        onDefect: (defect) => (
          <ErrorCard message={`Something went wrong: ${String(defect)}`} />
        ),
        onSuccess: ({ value }) => <Loaded project={value} />
      })}
    </PageContainer>
  )
}

function Loaded({
  project
}: {
  project: {
    slug: string
    name: string
    body: string
  }
}) {
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  return (
    <>
      <PageHeader>
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FolderKanban className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <NameField slug={project.slug} name={project.name} />
            <p className="font-mono text-xs text-muted-foreground">
              /{project.slug}
            </p>
          </div>
          <SaveIndicator status={bodyStatus} />
          <ProjectMenu slug={project.slug} />
        </div>
      </PageHeader>

      <BodyCard
        slug={project.slug}
        body={project.body}
        onStatusChange={setBodyStatus}
      />
    </>
  )
}

// --- Inline-editable name ---------------------------------------------------

function NameField({ slug, name }: { slug: string; name: string }) {
  const update = useAtomSet(updateProjectAtom)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [editing, name])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      setDraft(name)
      return
    }
    setSaving(true)
    try {
      await update({ slug, name: trimmed })
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function cancel() {
    setDraft(name)
    setEditing(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancel()
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-1 truncate rounded px-1 text-left text-2xl font-semibold tracking-tight hover:bg-accent/40"
      >
        {name}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKey}
      className="-mx-1 w-full rounded bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={120}
      aria-label="Project name"
    />
  )
}

// --- Project context menu ---------------------------------------------------

function ProjectMenu({ slug }: { slug: string }) {
  const remove = useAtomSet(deleteProjectAtom)
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    setDeleting(true)
    try {
      await remove({ slug })
      navigate({ to: "/projects" })
    } catch {
      setDeleting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Project actions"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-48">
        <DropdownMenuItem
          disabled={deleting}
          onSelect={(e) => {
            e.preventDefault()
            void onDelete()
          }}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
          {deleting ? "Deleting…" : "Delete project"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// --- Always-editable body --------------------------------------------------

function BodyCard({
  slug,
  body,
  onStatusChange
}: {
  slug: string
  body: string
  onStatusChange: (status: SaveStatus) => void
}) {
  const update = useAtomSet(updateProjectAtom)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Description</CardTitle>
        <CardDescription>
          Stored as <span className="font-mono">project.md</span> on disk.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* `key={slug}` ensures the editor remounts cleanly when the user
            switches between projects within the same route component. Within
            a single project the editor owns its own state — the autosave
            round-trip is not allowed to reset the cursor. */}
        <LexicalEditor
          key={slug}
          markdown={body}
          onChange={(next) => update({ slug, body: next })}
          onStatusChange={onStatusChange}
        />
      </CardContent>
    </Card>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : null
  if (!label) return null
  return (
    <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
  )
}

// --- States -----------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
    </div>
  )
}

function NotFoundCard({ slug }: { slug: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project not found</CardTitle>
        <CardDescription>
          No project at <span className="font-mono">/{slug}</span>. It may have
          been removed, or you may not have access.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Couldn't load project</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  )
}
