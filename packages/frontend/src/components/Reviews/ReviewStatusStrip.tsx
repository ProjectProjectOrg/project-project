import { Pip, type ReviewTone } from "@/components/Reviews/ReviewIndicators"
import { m } from "@/paraglide/messages"
import type {
  MergeDisabledReason,
  ReviewCheckRollup,
  ReviewPage,
  ReviewReviewer
} from "@projectproject/shared"

export function ReviewStatusStrip({ review }: { review: ReviewPage }) {
  const reviewCell = reviewStripCell(review.reviewers)
  const checksCell = checksStripCell(review.pr.checks)
  const branchCell = branchStripCell(
    review.pr.draft,
    review.pr.mergeable,
    review.capabilities.disabledReasons.merge
  )

  return (
    <div className="grid grid-cols-1 divide-y divide-border/60 border-b border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <StripCell {...reviewCell} />
      <StripCell {...checksCell} />
      <StripCell {...branchCell} />
    </div>
  )
}

function StripCell({
  tone,
  label,
  value
}: {
  tone: ReviewTone
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 py-3 text-sm">
      <Pip tone={tone} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/30" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  )
}

function reviewStripCell(reviewers: ReadonlyArray<ReviewReviewer>) {
  const changes = reviewers.filter((r) => r.decision === "changes_requested")
  const approvals = reviewers.filter((r) => r.decision === "approved")
  if (reviewers.length === 0) {
    return {
      tone: "warning" as ReviewTone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_none()
    }
  }
  if (changes.length > 0) {
    return {
      tone: "danger" as ReviewTone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_changes_requested()
    }
  }
  if (approvals.length > 0) {
    return {
      tone: "success" as ReviewTone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_approved()
    }
  }
  return {
    tone: "warning" as ReviewTone,
    label: m.reviews_strip_review_label(),
    value: m.reviews_strip_review_pending()
  }
}

function checksStripCell(checks: ReviewCheckRollup) {
  const label = m.reviews_strip_checks_label()
  if (checks.status === "none" || checks.totalCount === 0) {
    return {
      tone: "muted" as ReviewTone,
      label,
      value: m.reviews_strip_checks_none()
    }
  }
  const counts = { completed: checks.completedCount, total: checks.totalCount }
  if (checks.status === "passing") {
    return {
      tone: "success" as ReviewTone,
      label,
      value: m.reviews_strip_checks_passing(counts)
    }
  }
  if (checks.status === "failing") {
    return {
      tone: "danger" as ReviewTone,
      label,
      value: m.reviews_strip_checks_failing(counts)
    }
  }
  if (checks.status === "pending") {
    return {
      tone: "warning" as ReviewTone,
      label,
      value: m.reviews_strip_checks_pending(counts)
    }
  }
  return {
    tone: "muted" as ReviewTone,
    label,
    value: m.reviews_strip_checks_neutral(counts)
  }
}

function branchStripCell(
  draft: boolean,
  mergeable: boolean | null,
  reason: MergeDisabledReason | null
) {
  const label = m.reviews_strip_branch_label()
  if (draft) {
    return {
      tone: "muted" as ReviewTone,
      label,
      value: m.reviews_strip_branch_draft()
    }
  }
  if (mergeable === false || reason === "not_mergeable") {
    return {
      tone: "danger" as ReviewTone,
      label,
      value: m.reviews_strip_branch_conflicts()
    }
  }
  if (mergeable === null) {
    return {
      tone: "muted" as ReviewTone,
      label,
      value: m.reviews_strip_branch_unknown()
    }
  }
  return {
    tone: "success" as ReviewTone,
    label,
    value: m.reviews_strip_branch_clean()
  }
}
