import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, RotateCcw, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Pip, type ReviewTone } from "@/components/Reviews/ReviewIndicators"
import { ReviewMergeAction } from "@/components/Reviews/ReviewMergeAction"
import { ReviewStatusStrip } from "@/components/Reviews/ReviewStatusStrip"
import {
  closeReviewAtom,
  mergeReviewAtom,
  reopenReviewAtom,
  reviewKey
} from "@/atoms/reviews"
import {
  blockReason,
  closeDisabledReasonLabel,
  preferredMergeMethod,
  reopenDisabledReasonLabel
} from "@/components/Reviews/ReviewLabels"
import { formatRelative } from "@/lib/relative-time"
import { m } from "@/paraglide/messages"
import type { ReviewMergeMethod, ReviewPage } from "@projectproject/shared"

export function ReviewActions({
  orgSlug,
  slug,
  prNumber,
  review
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPage
}) {
  const key = reviewKey(orgSlug, slug, prNumber)
  const preferredMethod = preferredMergeMethod(review.mergeMethods.allowed)
  const [method, setMethod] = useState<ReviewMergeMethod>(preferredMethod)
  const merge = useAtomSet(mergeReviewAtom(key), { mode: "promise" })
  const close = useAtomSet(closeReviewAtom(key), { mode: "promise" })
  const reopen = useAtomSet(reopenReviewAtom(key), { mode: "promise" })
  const mergeState = useAtomValue(mergeReviewAtom(key))
  const closeState = useAtomValue(closeReviewAtom(key))
  const reopenState = useAtomValue(reopenReviewAtom(key))
  const busy = mergeState.waiting || closeState.waiting || reopenState.waiting
  const availableMethods = review.mergeMethods.allowed
  const currentMethod = availableMethods.includes(method)
    ? method
    : preferredMethod
  const mergeDisabledReason = review.capabilities.disabledReasons.merge
  const closeDisabledReason = review.capabilities.disabledReasons.close
  const reopenDisabledReason = review.capabilities.disabledReasons.reopen
  const canUseMerge =
    review.capabilities.canMerge && availableMethods.length > 0 && !busy
  const canClose = review.capabilities.canClose && !busy
  const canReopen = review.capabilities.canReopen && !busy
  const merged = review.pr.state === "merged"
  const closed = review.pr.state === "closed"
  const mergeAllowed =
    mergeDisabledReason === null && review.pr.mergeable !== false
  const mutationError = Result.isFailure(mergeState)
    ? m.reviews_error_merge()
    : Result.isFailure(closeState)
      ? m.reviews_error_close()
      : Result.isFailure(reopenState)
        ? m.reviews_error_reopen()
        : null

  function runMerge() {
    void merge({ method: currentMethod }).catch(() => {})
  }

  function runClose() {
    void close().catch(() => {})
  }

  function runReopen() {
    void reopen().catch(() => {})
  }

  if (merged) {
    return (
      <Verdict
        tone="muted"
        label={m.reviews_verdict_merged({
          when: formatRelative(review.pr.mergedAt ?? review.pr.updatedAt)
        })}
      />
    )
  }

  if (closed) {
    return (
      <Verdict
        tone="muted"
        label={m.reviews_verdict_closed({
          when: formatRelative(review.pr.closedAt ?? review.pr.updatedAt)
        })}
        trailing={
          <Button
            size="sm"
            variant="tertiary"
            leadingIcon={RotateCcw}
            disabled={!canReopen}
            loading={reopenState.waiting}
            onClick={runReopen}
          >
            {m.reviews_action_reopen()}
          </Button>
        }
        error={
          mutationError ??
          (reopenDisabledReason
            ? reopenDisabledReasonLabel(reopenDisabledReason)
            : null)
        }
      />
    )
  }

  return (
    <section className="overflow-hidden rounded-lg bg-accent">
      <ReviewStatusStrip review={review} />
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ReviewMergeAction
            canUseMerge={canUseMerge}
            mergeAllowed={mergeAllowed}
            availableMethods={availableMethods}
            currentMethod={currentMethod}
            onSelectMethod={setMethod}
            onMerge={runMerge}
            loading={mergeState.waiting}
            busy={busy}
          />
          <Button
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/reviews/$prNumber"
                params={{ orgSlug, slug, prNumber: String(prNumber) }}
                search={{ view: "files" }}
              />
            }
            size="md"
            variant="tertiary"
          >
            {m.reviews_action_submit_review()}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={m.reviews_actions_more()}
                  disabled={busy}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                variant="destructive"
                disabled={!canClose}
                onClick={runClose}
              >
                <X className="size-4" strokeWidth={1.75} />
                {m.reviews_action_close()}
              </DropdownMenuItem>
              {closeDisabledReason && (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1 text-xs leading-snug text-muted-foreground">
                    {closeDisabledReasonLabel(closeDisabledReason)}
                  </p>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {(mutationError ?? blockReason(mergeDisabledReason)) && (
          <p className="min-w-0 text-sm text-muted-foreground">
            {mutationError ?? blockReason(mergeDisabledReason)}
          </p>
        )}
      </div>
    </section>
  )
}

function Verdict({
  tone,
  label,
  trailing,
  error
}: {
  tone: ReviewTone
  label: string
  trailing?: React.ReactNode
  error?: string | null
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-accent">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Pip tone={tone} />
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        {trailing}
      </div>
      {error && (
        <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          {error}
        </p>
      )}
    </section>
  )
}
