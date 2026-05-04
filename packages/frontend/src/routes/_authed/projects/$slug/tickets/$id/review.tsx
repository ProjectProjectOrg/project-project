// PR review page — renders the unified diff + file tree for the PR
// linked to a ticket. Backed by /projects/:slug/tickets/:id/review.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { parsePatchFiles } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed
} from "lucide-react"
import { useMemo } from "react"
import { ticketReviewAtom, reviewKey } from "@/atoms/reviews"
import {
  Card,
  CardContent,
  CardHeader
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  PullRequestReviewBundle,
  TicketId
} from "@projectproject/shared"

// Render one <FileDiff> per parsed file from the unified patch string.
// The patch string can carry multiple files (PR diff) and even multiple
// commits — parsePatchFiles flattens both. Each file's `.name` is the
// path (or new path on rename).
function Diff({ patch }: { patch: string }) {
  const files = useMemo(
    () => parsePatchFiles(patch).flatMap((p) => p.files),
    [patch]
  )
  return (
    <div className="flex flex-col gap-4">
      {files.map((file, i) => (
        <FileDiff key={`${file.name}-${i}`} fileDiff={file} />
      ))}
    </div>
  )
}

export const Route = createFileRoute(
  "/_authed/projects/$slug/tickets/$id/review"
)({
  component: ReviewPage,
  loader: () => ({
    crumb: { type: "static" as const, label: "Review" }
  })
})

function ReviewPage() {
  const { slug, id } = Route.useParams()
  const result = useAtomValue(
    ticketReviewAtom(reviewKey(slug, id as TicketId))
  )

  return Result.matchWithError(result, {
    onInitial: () => <ReviewSkeleton />,
    onError: (error) => (
      <ReviewError slug={slug} id={id as TicketId} tag={error._tag} />
    ),
    onDefect: () => (
      <ReviewError slug={slug} id={id as TicketId} tag="GitHubError" />
    ),
    onSuccess: ({ value }) => (
      <Card>
        <CardHeader>
          <ReviewHeader bundle={value} slug={slug} id={id as TicketId} />
        </CardHeader>
        <CardContent>
          <Diff patch={value.patch} />
        </CardContent>
      </Card>
    )
  })
}

function ReviewHeader({
  bundle,
  slug,
  id
}: {
  bundle: PullRequestReviewBundle
  slug: string
  id: TicketId
}) {
  const status: "open" | "draft" | "merged" | "closed" =
    bundle.state === "merged"
      ? "merged"
      : bundle.state === "closed"
        ? "closed"
        : bundle.draft
          ? "draft"
          : "open"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: id }}
          className="mt-0.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to ticket"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </Link>
        <h1 className="flex-1 text-lg font-semibold leading-tight">
          {bundle.title}{" "}
          <span className="text-muted-foreground font-normal">
            #{bundle.number}
          </span>
        </h1>
        <PrStatusChip status={status} />
        <a
          href={bundle.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Open in GitHub
          <ArrowUpRight className="size-3" strokeWidth={1.75} />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">
          {bundle.baseBranch} ← {bundle.headBranch}
        </span>
        <span>·</span>
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{bundle.additions}
          </span>{" "}
          /{" "}
          <span className="text-red-600 dark:text-red-400">
            −{bundle.deletions}
          </span>
        </span>
        <span>·</span>
        <span>{bundle.changedFiles} files</span>
        {bundle.author && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
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

function PrStatusChip({
  status
}: {
  status: "open" | "draft" | "merged" | "closed"
}) {
  const tint =
    status === "merged"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
      : status === "closed"
        ? "bg-muted text-muted-foreground"
        : status === "draft"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon =
    status === "merged"
      ? GitMerge
      : status === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />
      {status}
    </span>
  )
}

function ReviewSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted/60" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 animate-pulse rounded bg-muted/60" />
      </CardContent>
    </Card>
  )
}

function ReviewError({
  slug,
  id,
  tag
}: {
  slug: string
  id: TicketId
  tag: string
}) {
  // Placeholder rendering — replaced with the full taxonomy in Task 10.
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold">Couldn't load review</h1>
        <p className="text-sm text-muted-foreground">{tag}</p>
      </CardHeader>
      <CardContent>
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: id }}
          className="text-sm text-primary underline"
        >
          Back to ticket
        </Link>
      </CardContent>
    </Card>
  )
}
