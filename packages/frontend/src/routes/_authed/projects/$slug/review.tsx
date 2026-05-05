// PR review page — diff + file tree for the PR linked to a ticket.
// URL: /projects/<slug>/review?ticket=T-12. Renders inside the project
// layout, so it inherits the project header + tab strip; the card fills
// the remaining viewport via the flex chain set up in Shell + PageContainer.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { parsePatchFiles } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
// We mount the tree imperatively (see FileTree below) instead of using
// @pierre/trees/react because that package's `useFileTree` is not
// StrictMode-safe: it creates the model during render and destroys it on
// the simulated unmount, leaving the rendered <FileTree model={...}> with
// a destroyed instance. Importing the class + web-components directly
// sidesteps that.
import { FileTree as FileTreeModel, type GitStatusEntry } from "@pierre/trees"
import "@pierre/trees/web-components"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed
} from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useRef } from "react"
import { reviewKey, ticketReviewAtom } from "@/atoms/reviews"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"
import type {
  PullRequestReviewBundle,
  ReviewFileSummary,
  TicketId
} from "@projectproject/shared"

export const Route = createFileRoute("/_authed/projects/$slug/review")({
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): { ticket: string } => ({
    ticket: typeof search.ticket === "string" ? search.ticket : ""
  }),
  loader: ({ params }) => ({
    crumb: [
      { type: "static" as const, label: "Projects", to: "/projects" },
      { type: "project" as const, slug: params.slug },
      { type: "static" as const, label: "Review" }
    ]
  })
})

function ReviewPage() {
  const { slug } = Route.useParams()
  const { ticket } = Route.useSearch()
  const ticketId = ticket as TicketId

  if (!ticket) return <ReviewError slug={slug} tag="MissingTicket" />

  return <ReviewBody slug={slug} ticketId={ticketId} />
}

function ReviewBody({ slug, ticketId }: { slug: string; ticketId: TicketId }) {
  const result = useAtomValue(ticketReviewAtom(reviewKey(slug, ticketId)))

  return Result.matchWithError(result, {
    onInitial: () => <ReviewSkeleton />,
    onError: (error) => (
      <ReviewError
        slug={slug}
        ticketId={ticketId}
        tag={error._tag}
      />
    ),
    onDefect: () => (
      <ReviewError slug={slug} ticketId={ticketId} tag="GitHubError" />
    ),
    onSuccess: ({ value }) => (
      <ReviewLayout bundle={value} slug={slug} ticketId={ticketId} />
    )
  })
}

function ReviewLayout({
  bundle,
  slug,
  ticketId
}: {
  bundle: PullRequestReviewBundle
  slug: string
  ticketId: TicketId
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background">
      <ReviewHeader bundle={bundle} slug={slug} ticketId={ticketId} />
      <div className="min-h-0 flex-1 border-t border-border/60 p-3">
        <div className="grid h-full min-h-0 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-h-0">
            <FileTree
              className="h-full overflow-hidden rounded-md border border-border/50 bg-background"
              files={bundle.files}
              onSelect={(path) => {
                const el = document.getElementById(fileAnchorId(path))
                el?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            />
          </aside>
          <div className="min-h-0 min-w-0 overflow-auto">
            <Diff patch={bundle.patch} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ReviewHeader({
  bundle,
  slug,
  ticketId
}: {
  bundle: PullRequestReviewBundle
  slug: string
  ticketId: TicketId
}) {
  const status: PrStatus = bundle.state === "merged"
    ? "merged"
    : bundle.state === "closed"
    ? "closed"
    : bundle.draft
    ? "draft"
    : "open"

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: ticketId }}
          aria-label="Back to ticket"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
          {bundle.title}{" "}
          <span className="font-normal text-muted-foreground">
            #{bundle.number}
          </span>
        </h1>
        <PrStatusChip status={status} />
        <a
          href={bundle.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Open in GitHub
          <ArrowUpRight className="size-3" strokeWidth={1.75} />
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-xs text-muted-foreground">
        <span className="font-mono">
          {bundle.baseBranch}{" "}
          <span className="text-muted-foreground/60">←</span>{" "}
          {bundle.headBranch}
        </span>
        <Dot />
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{bundle.additions}
          </span>
          {" / "}
          <span className="text-red-600 dark:text-red-400">
            −{bundle.deletions}
          </span>
        </span>
        <Dot />
        <span>
          {bundle.changedFiles} {bundle.changedFiles === 1 ? "file" : "files"}
        </span>
        {bundle.author && (
          <>
            <Dot />
            <span className="inline-flex items-center gap-1.5">
              {bundle.author.avatarUrl && (
                <img
                  src={bundle.author.avatarUrl}
                  alt=""
                  className="size-4 rounded-full"
                />
              )}
              by @{bundle.author.login}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function Dot() {
  return <span className="text-muted-foreground/40">·</span>
}

type PrStatus = "open" | "draft" | "merged" | "closed"

function PrStatusChip({ status }: { status: PrStatus }) {
  const tint = status === "merged"
    ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
    : status === "closed"
    ? "bg-muted text-muted-foreground"
    : status === "draft"
    ? "bg-muted text-muted-foreground"
    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon = status === "merged"
    ? GitMerge
    : status === "closed"
    ? GitPullRequestClosed
    : GitPullRequest
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Diff + file tree
// ---------------------------------------------------------------------------

function fileAnchorId(path: string): string {
  return `file-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function Diff({ patch }: { patch: string }) {
  const { resolvedTheme } = useTheme()
  const files = useMemo(
    () => parsePatchFiles(patch).flatMap((p) => p.files),
    [patch]
  )
  const diffOptions = useMemo(
    () => ({
      theme: {
        dark: "pierre-dark",
        light: "pierre-light"
      },
      themeType: resolvedTheme
    }),
    [resolvedTheme]
  )
  return (
    <div className="flex flex-col gap-4">
      {files.map((file, i) => (
        <div
          key={`${file.name}-${i}`}
          id={fileAnchorId(file.name)}
          className="scroll-mt-20"
        >
          <FileDiff fileDiff={file} options={diffOptions} />
        </div>
      ))}
    </div>
  )
}

function FileTree({
  files,
  onSelect,
  className
}: {
  files: ReadonlyArray<ReviewFileSummary>
  onSelect: (path: string) => void
  className?: string
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const paths = useMemo(() => files.map((f) => f.path), [files])
  const gitStatus = useMemo(
    () => files.flatMap((file) => toTreeGitStatus(file)),
    [files]
  )
  const visibleRows = Math.min(Math.max(paths.length, 24), 40)

  // Build + render + tear down the model entirely inside an effect so
  // StrictMode's mount→unmount→mount cycle gets a fresh model each time.
  // The mount node needs an explicit height because @pierre/trees sets the
  // shadow host to height: 100%; min-height leaves that percentage unresolved.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (wrapper == null) return

    const filePathSet = new Set(paths)
    const model = new FileTreeModel({
      initialExpansion: "open",
      itemHeight: 28,
      paths,
      gitStatus,
      initialVisibleRowCount: visibleRows,
      unsafeCSS: `
        [data-file-tree-virtualized-scroll='true'] {
          padding: 0;
        }

        [data-file-tree-virtualized-list='true'] {
          box-sizing: border-box;
          min-height: 100%;
          padding: 6px;
        }

        [role='tree'] {
          width: 100%;
        }

        [data-type='item'] {
          background: transparent;
          border-radius: 4px;
          margin-inline: 0;
        }

        [data-type='item']:hover,
        [data-type='item'][data-item-context-hover='true'] {
          background: color-mix(in oklch, var(--trees-fg) 7%, transparent);
        }

        [data-type='item'][data-item-git-status] > [data-item-section='content'] {
          color: var(--trees-fg);
        }

        [data-type='item'][data-item-selected='true'] {
          background: color-mix(in oklch, var(--trees-fg) 8%, transparent);
        }

        [data-type='item'][data-item-focused='true']::before,
        [data-type='item']:focus-visible::before {
          border-radius: 4px;
          outline-color: color-mix(in oklch, var(--trees-fg) 18%, transparent);
        }
      `,
      onSelectionChange: (selectedPaths) => {
        const last = selectedPaths.at(-1)
        if (last != null && filePathSet.has(last)) onSelectRef.current(last)
      }
    })
    model.render({ containerWrapper: wrapper })

    return () => {
      model.cleanUp()
    }
  }, [paths, gitStatus, visibleRows])

  const treeStyle = {
    height: "100%",
    "--trees-bg-override": "transparent",
    "--trees-bg-muted-override": "var(--accent)",
    "--trees-border-color-override": "var(--border)",
    "--trees-fg-override": "var(--foreground)",
    "--trees-fg-muted-override": "var(--muted-foreground)",
    "--trees-selected-bg-override": "var(--selected)",
    "--trees-selected-fg-override": "var(--foreground)",
    "--trees-border-radius-override": "4px",
    "--trees-item-padding-x-override": "6px",
    "--trees-item-row-gap-override": "4px",
    "--trees-icon-width-override": "14px",
    "--trees-font-family-override":
      "ui-monospace, SFMono-Regular, Menlo, monospace",
    "--trees-font-size-override": "12px",
    "--trees-padding-inline-override": "6px"
  } as CSSProperties

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={treeStyle}
    />
  )
}

function toTreeGitStatus(
  file: ReviewFileSummary
): ReadonlyArray<GitStatusEntry> {
  switch (file.status) {
    case "added":
      return [{ path: file.path, status: "added" }]
    case "removed":
      return [{ path: file.path, status: "deleted" }]
    case "renamed":
      return [{ path: file.path, status: "renamed" }]
    case "copied":
      return [{ path: file.path, status: "added" }]
    case "changed":
    case "modified":
      return [{ path: file.path, status: "modified" }]
    case "unchanged":
      return []
  }
}

// ---------------------------------------------------------------------------
// Skeleton + errors
// ---------------------------------------------------------------------------

function ReviewSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted/60" />
          <div className="ml-auto h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted/60" />
          <div className="h-5 w-28 shrink-0 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="ml-11 mt-2 h-3 w-1/2 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="border-t border-border/60 p-5">
        <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {[80, 65, 75, 50, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-muted/60"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-56 animate-pulse rounded-xl bg-muted/60" />
          </div>
        </div>
      </div>
    </div>
  )
}

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  MissingTicket: {
    title: "No ticket selected",
    body: "Open this page from a ticket's PR badge."
  },
  NotFound: {
    title: "No PR yet",
    body: "This ticket doesn't have an open pull request to review."
  },
  Conflict: {
    title: "No GitHub repo connected",
    body: "Connect a repository to this project to review pull requests."
  },
  GitHubTokenExpired: {
    title: "GitHub session expired",
    body: "Reconnect your GitHub account to view this review."
  },
  GitHubScopeInsufficient: {
    title: "Insufficient GitHub permissions",
    body: "GitHub didn't grant the access this repo needs."
  },
  RepoGone: {
    title: "Repository missing",
    body: "The connected repo no longer exists or isn't reachable."
  },
  RateLimited: {
    title: "GitHub rate-limited us",
    body: "Try again in a minute — we've hit GitHub's request quota."
  },
  Unauthorized: {
    title: "Couldn't load the review",
    body: "Your session may have expired."
  },
  GitHubError: {
    title: "Couldn't load the review",
    body: "GitHub returned an unexpected error."
  }
}

function ReviewError({
  slug,
  ticketId,
  tag
}: {
  slug: string
  ticketId?: TicketId
  tag: string
}) {
  const copy = ERROR_COPY[tag] ?? ERROR_COPY["GitHubError"]
  return (
    <div className="rounded-2xl border border-border bg-background px-5 py-10 text-center">
      <h1 className="text-base font-semibold">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      <Link
        to="/projects/$slug"
        params={{ slug }}
        search={ticketId ? { ticket: ticketId } : {}}
        className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Back to project
      </Link>
    </div>
  )
}
