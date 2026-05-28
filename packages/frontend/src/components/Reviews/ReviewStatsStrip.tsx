import { Link } from "@tanstack/react-router"
import { FileCode2, GitCommitVertical, MessageSquareText } from "lucide-react"
import { DiffPips } from "@/components/Reviews/ReviewIndicators"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ReviewPage } from "@projectproject/shared"

export function ReviewStatsStrip({
  review,
  orgSlug,
  slug
}: {
  review: ReviewPage
  orgSlug: string
  slug: string
}) {
  const counts = review.pr.counts
  return (
    <div className="@container flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 @max-xs:flex-col @max-xs:items-start">
      <div className="flex items-center gap-x-3 gap-y-2 whitespace-nowrap text-sm text-muted-foreground @max-xs:flex-col @max-xs:items-start">
        <Stat icon={GitCommitVertical}>
          {m.reviews_counts_commits({ count: counts.commits })}
        </Stat>
        <span className="text-muted-foreground/50 @max-xs:hidden">·</span>
        <Stat icon={FileCode2}>
          {m.reviews_counts_files({ count: counts.filesChanged })}
        </Stat>
        <span className="font-mono text-state-success tabular-nums">
          +{counts.additions}
        </span>
        <span className="font-mono text-state-danger tabular-nums">
          -{counts.deletions}
        </span>
        <DiffPips additions={counts.additions} deletions={counts.deletions} />
        {counts.reviewComments > 0 && (
          <Stat icon={MessageSquareText}>
            {m.reviews_counts_review_comments({
              count: counts.reviewComments
            })}
          </Stat>
        )}
      </div>
      <Button
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/reviews/$prNumber"
            params={{
              orgSlug,
              slug,
              prNumber: String(review.pr.number)
            }}
            search={{ view: "files" }}
          />
        }
        size="sm"
        variant="primary"
      >
        {m.reviews_action_review_changes()}
      </Button>
    </div>
  )
}

function Stat({
  icon: Icon,
  tone,
  children
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  tone?: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("size-4", tone)} strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  )
}
