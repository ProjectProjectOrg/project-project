import { useRouter } from "@tanstack/react-router"
import { FileCode2, GitPullRequestArrow, RefreshCw } from "lucide-react"
import {
  ActorAvatar,
  ReviewOverview
} from "@/components/Reviews/ReviewOverview"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type {
  ReviewActor,
  ReviewPage as ReviewPageDto,
  ReviewPrState
} from "@projectproject/shared"

type ReviewView = "overview" | "files"

export function ReviewPage({
  orgSlug,
  slug,
  prNumber,
  review,
  view,
  waiting
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPageDto
  view: ReviewView
  waiting: boolean
}) {
  const router = useRouter()
  const pr = review.pr
  const reviewDisabledReason = review.capabilities.disabledReasons.review
  const showGithubBanner =
    reviewDisabledReason === "personal_github_required" ||
    review.capabilities.disabledReasons.merge === "personal_github_required" ||
    review.capabilities.disabledReasons.close === "personal_github_required" ||
    review.capabilities.disabledReasons.reopen === "personal_github_required"

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {showGithubBanner && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {m.reviews_banner_personal_github_title()}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.reviews_banner_personal_github_body()}
            </p>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-3 border-b border-border/70 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <GitPullRequestArrow
            className={cn(
              "size-6 shrink-0",
              pr.state === "open"
                ? "text-state-success"
                : pr.state === "merged"
                  ? "text-state-merged"
                  : "text-muted-foreground"
            )}
            strokeWidth={2}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="min-w-0 text-lg font-semibold leading-tight tracking-tight text-foreground md:text-xl">
              {pr.title}
            </h1>
            {pr.draft && <Badge tone="muted">{m.reviews_pr_draft()}</Badge>}
          </div>
          <Button
            variant="tertiary"
            size="sm"
            leadingIcon={RefreshCw}
            onClick={() => void router.invalidate()}
          >
            {m.reviews_action_refresh()}
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Badge tone={stateTone(pr.state)} className="shrink-0">
            {stateLabel(pr.state)}
          </Badge>
          <ActorMerge
            actor={pr.author}
            base={pr.base.label}
            head={pr.head.label}
          />
        </div>
      </header>

      <div className={cn(waiting && "animate-pulse")}>
        {view === "overview" ? (
          <ReviewOverview
            orgSlug={orgSlug}
            slug={slug}
            prNumber={prNumber}
            review={review}
          />
        ) : (
          <FilesPlaceholder />
        )}
      </div>
    </div>
  )
}

function ActorMerge({
  actor,
  base,
  head
}: {
  actor: ReviewActor
  base: string
  head: string
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ActorAvatar actor={actor} size="xs" />
      <span className="shrink-0 font-medium text-foreground">
        {actor.login}
      </span>
      <span className="shrink-0">{m.reviews_branch_merge_into()}</span>
      <BranchChip value={base} fixed />
      <span className="shrink-0">{m.reviews_branch_merge_from()}</span>
      <BranchChip value={head} />
    </span>
  )
}

function BranchChip({
  value,
  fixed = false
}: {
  value: string
  fixed?: boolean
}) {
  const label = value.includes(":")
    ? value.split(":").slice(1).join(":")
    : value
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground",
        fixed ? "shrink-0" : "min-w-0"
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

function stateTone(state: ReviewPrState): BadgeTone {
  if (state === "open") return "emerald"
  if (state === "merged") return "violet"
  return "muted"
}

function stateLabel(state: ReviewPrState): string {
  if (state === "open") return m.reviews_pr_open()
  if (state === "merged") return m.reviews_pr_merged()
  return m.reviews_pr_closed()
}

function FilesPlaceholder() {
  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-6 text-center">
      <FileCode2
        className="size-6 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden
      />
      <h2 className="text-base font-medium tracking-tight">
        {m.reviews_files_placeholder_title()}
      </h2>
      <p className="max-w-[32ch] text-sm text-muted-foreground">
        {m.reviews_files_placeholder_body()}
      </p>
    </div>
  )
}

export function ReviewPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="size-7 shrink-0 rounded bg-muted" />
          <div className="h-9 min-w-0 flex-1 rounded bg-muted" />
          <div className="h-8 w-24 rounded-md bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 rounded bg-muted" />
          <div className="size-5 rounded-full bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-5 w-40 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <div className="h-14 rounded-lg bg-muted/70" />
          <div className="h-72 rounded-lg bg-muted/60" />
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          <div className="h-28 rounded-lg bg-muted/70" />
          <div className="h-36 rounded-lg bg-muted/60" />
          <div className="h-36 rounded-lg bg-muted/60" />
        </div>
      </div>
    </div>
  )
}
