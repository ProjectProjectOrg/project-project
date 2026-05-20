import { Link, useRouter } from "@tanstack/react-router"
import { FileCode2, GitPullRequest, RefreshCw } from "lucide-react"
import { ReviewOverview } from "@/components/Reviews/ReviewOverview"
import { Button } from "@/components/ui/button"
import {
  SegmentedTabs,
  SEGMENTED_ITEM_CLASS,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ReviewPage as ReviewPageDto } from "@projectproject/shared"

type ReviewView = "overview" | "files"

const viewItems: ReadonlyArray<SegmentedItem<ReviewView>> = [
  {
    key: "overview",
    label: m.reviews_action_view_overview(),
    icon: GitPullRequest
  },
  {
    key: "files",
    label: m.reviews_action_view_files(),
    icon: FileCode2
  }
]

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

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
        <SegmentedTabs
          items={viewItems}
          layoutId="review-view"
          isActive={(key) => key === view}
          renderItem={(item, content, { active }) => (
            <Link
              to="/orgs/$orgSlug/projects/$slug/reviews/$prNumber"
              params={{ orgSlug, slug, prNumber: String(prNumber) }}
              search={{ view: item.key }}
              aria-current={active ? "page" : undefined}
              className={SEGMENTED_ITEM_CLASS(active)}
            >
              {content}
            </Link>
          )}
        />
        <Button
          variant="tertiary"
          size="sm"
          leadingIcon={RefreshCw}
          onClick={() => void router.invalidate()}
        >
          {m.reviews_action_refresh()}
        </Button>
      </div>

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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div className="h-9 w-44 rounded-xl bg-muted" />
        <div className="h-7 w-24 rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="h-10 w-3/4 rounded bg-muted" />
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
