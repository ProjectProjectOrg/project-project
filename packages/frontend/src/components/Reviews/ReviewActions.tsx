import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import {
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
  X
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  closeReviewAtom,
  mergeReviewAtom,
  reopenReviewAtom,
  reviewKey
} from "@/atoms/reviews"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/relative-time"
import { m } from "@/paraglide/messages"
import type {
  CloseDisabledReason,
  MergeDisabledReason,
  ReviewCheckRollup,
  ReviewMergeMethod,
  ReviewPage,
  ReviewReviewer,
  ReopenDisabledReason
} from "@projectproject/shared"

type Tone = "success" | "danger" | "warning" | "muted"

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
      <StatusStrip review={review} />
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <MergeAction
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
  tone: Tone
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

function StatusStrip({ review }: { review: ReviewPage }) {
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
  tone: Tone
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

function Pip({ tone }: { tone: Tone }) {
  const toneClasses: Record<Tone, string> = {
    success: "bg-state-success",
    danger: "bg-state-danger",
    warning: "bg-state-warning",
    muted: "bg-muted-foreground/40"
  }
  return (
    <span
      className={cn("size-2 shrink-0 rounded-sm", toneClasses[tone])}
      aria-hidden
    />
  )
}

function MergeAction({
  canUseMerge,
  mergeAllowed,
  availableMethods,
  currentMethod,
  onSelectMethod,
  onMerge,
  loading,
  busy
}: {
  canUseMerge: boolean
  mergeAllowed: boolean
  availableMethods: ReadonlyArray<ReviewMergeMethod>
  currentMethod: ReviewMergeMethod
  onSelectMethod: (method: ReviewMergeMethod) => void
  onMerge: () => void
  loading: boolean
  busy: boolean
}) {
  const hasChevron = availableMethods.length > 1
  const disabled = !canUseMerge || !mergeAllowed
  const ready = canUseMerge && mergeAllowed
  const readyClass = ready
    ? "bg-state-success text-background hover:bg-state-success/90 active:bg-state-success/80"
    : ""
  return (
    <div className="inline-flex overflow-hidden rounded-md">
      <Button
        size="md"
        variant="primary"
        disabled={disabled}
        loading={loading}
        onClick={onMerge}
        className={cn(
          "text-sm font-medium",
          hasChevron && "rounded-r-none",
          readyClass
        )}
      >
        <CollapsingLabel show contentKey={currentMethod}>
          {mergeMethodLabel(currentMethod)}
        </CollapsingLabel>
      </Button>
      {hasChevron && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="md"
                variant="primary"
                disabled={busy}
                className={cn(
                  "rounded-l-none border-l border-background/30 px-2",
                  readyClass
                )}
                aria-label={m.reviews_merge_method_select()}
              >
                <ChevronDown className="size-4" strokeWidth={1.75} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup
              value={currentMethod}
              onValueChange={(value) =>
                onSelectMethod(value as ReviewMergeMethod)
              }
            >
              {availableMethods.map((item) => (
                <DropdownMenuRadioItem key={item} value={item}>
                  {mergeMethodLabel(item)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function reviewStripCell(reviewers: ReadonlyArray<ReviewReviewer>) {
  const changes = reviewers.filter((r) => r.decision === "changes_requested")
  const approvals = reviewers.filter((r) => r.decision === "approved")
  if (reviewers.length === 0) {
    return {
      tone: "warning" as Tone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_none()
    }
  }
  if (changes.length > 0) {
    return {
      tone: "danger" as Tone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_changes_requested()
    }
  }
  if (approvals.length > 0) {
    return {
      tone: "success" as Tone,
      label: m.reviews_strip_review_label(),
      value: m.reviews_strip_review_approved()
    }
  }
  return {
    tone: "warning" as Tone,
    label: m.reviews_strip_review_label(),
    value: m.reviews_strip_review_pending()
  }
}

function checksStripCell(checks: ReviewCheckRollup) {
  const label = m.reviews_strip_checks_label()
  if (checks.status === "none" || checks.totalCount === 0) {
    return {
      tone: "muted" as Tone,
      label,
      value: m.reviews_strip_checks_none()
    }
  }
  const counts = { completed: checks.completedCount, total: checks.totalCount }
  if (checks.status === "passing") {
    return {
      tone: "success" as Tone,
      label,
      value: m.reviews_strip_checks_passing(counts)
    }
  }
  if (checks.status === "failing") {
    return {
      tone: "danger" as Tone,
      label,
      value: m.reviews_strip_checks_failing(counts)
    }
  }
  if (checks.status === "pending") {
    return {
      tone: "warning" as Tone,
      label,
      value: m.reviews_strip_checks_pending(counts)
    }
  }
  return {
    tone: "muted" as Tone,
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
      tone: "muted" as Tone,
      label,
      value: m.reviews_strip_branch_draft()
    }
  }
  if (mergeable === false || reason === "not_mergeable") {
    return {
      tone: "danger" as Tone,
      label,
      value: m.reviews_strip_branch_conflicts()
    }
  }
  if (mergeable === null) {
    return {
      tone: "muted" as Tone,
      label,
      value: m.reviews_strip_branch_unknown()
    }
  }
  return {
    tone: "success" as Tone,
    label,
    value: m.reviews_strip_branch_clean()
  }
}

function preferredMergeMethod(
  methods: ReadonlyArray<ReviewMergeMethod>
): ReviewMergeMethod {
  if (methods.includes("squash")) return "squash"
  return methods[0] ?? "squash"
}

function mergeMethodLabel(method: ReviewMergeMethod): string {
  if (method === "merge") return m.reviews_merge_method_merge()
  if (method === "rebase") return m.reviews_merge_method_rebase()
  return m.reviews_merge_method_squash()
}

function blockReason(reason: MergeDisabledReason | null): string | null {
  if (reason === null) return null
  return mergeDisabledReasonLabel(reason)
}

function mergeDisabledReasonLabel(reason: MergeDisabledReason): string {
  if (reason === "personal_github_required") {
    return m.reviews_disabled_personal_github_required()
  }
  if (reason === "insufficient_permission") {
    return m.reviews_disabled_insufficient_permission()
  }
  if (reason === "draft_pr") return m.reviews_disabled_draft_pr()
  if (reason === "not_mergeable") return m.reviews_disabled_not_mergeable()
  return m.reviews_disabled_pr_not_open()
}

function closeDisabledReasonLabel(reason: CloseDisabledReason): string {
  if (reason === "personal_github_required") {
    return m.reviews_disabled_personal_github_required()
  }
  if (reason === "insufficient_permission") {
    return m.reviews_disabled_insufficient_permission()
  }
  return m.reviews_disabled_pr_not_open()
}

function reopenDisabledReasonLabel(reason: ReopenDisabledReason): string {
  if (reason === "personal_github_required") {
    return m.reviews_disabled_personal_github_required()
  }
  if (reason === "insufficient_permission") {
    return m.reviews_disabled_insufficient_permission()
  }
  if (reason === "pr_merged") return m.reviews_disabled_pr_merged()
  return m.reviews_disabled_pr_not_closed()
}
