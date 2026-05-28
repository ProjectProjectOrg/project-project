import { m } from "@/paraglide/messages"
import type { BadgeTone } from "@/components/ui/badge"
import type {
  CloseDisabledReason,
  MergeDisabledReason,
  ReopenDisabledReason,
  ReviewCheckRollup,
  ReviewDecision,
  ReviewMergeMethod,
  ReviewParticipant,
  ReviewPrState,
  TicketStatus
} from "@projectproject/shared"

export function reviewPrStateTone(state: ReviewPrState): BadgeTone {
  if (state === "open") return "emerald"
  if (state === "merged") return "violet"
  return "muted"
}

export function reviewPrStateLabel(state: ReviewPrState): string {
  if (state === "open") return m.reviews_pr_open()
  if (state === "merged") return m.reviews_pr_merged()
  return m.reviews_pr_closed()
}

export function checkSummaryLabel(checks: ReviewCheckRollup): string {
  if (checks.status === "none" || checks.totalCount === 0) {
    return m.reviews_check_status_none()
  }
  if (checks.status === "passing") {
    return m.reviews_check_summary_passing({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "failing") {
    return m.reviews_check_summary_failing({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "pending") {
    return m.reviews_check_summary_pending({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  if (checks.status === "neutral") {
    return m.reviews_check_summary_neutral({
      completed: checks.completedCount,
      total: checks.totalCount
    })
  }
  return m.reviews_check_status_none()
}

export function decisionLabel(decision: ReviewDecision): string {
  if (decision === "approved") return m.reviews_decision_approved()
  if (decision === "changes_requested") {
    return m.reviews_decision_changes_requested()
  }
  if (decision === "commented") return m.reviews_decision_commented()
  if (decision === "pending") return m.reviews_decision_pending()
  if (decision === "dismissed") return m.reviews_decision_dismissed()
  return m.reviews_decision_none()
}

export function roleLabel(role: ReviewParticipant["role"]): string {
  if (role === "author") return m.reviews_role_author()
  if (role === "reviewer") return m.reviews_role_reviewer()
  if (role === "commenter") return m.reviews_role_commenter()
  return m.reviews_role_committer()
}

export function ticketStatusLabel(status: TicketStatus): string {
  if (status === "todo") return m.tickets_status_todo()
  if (status === "in_progress") return m.tickets_status_in_progress()
  return m.tickets_status_done()
}

export function preferredMergeMethod(
  methods: ReadonlyArray<ReviewMergeMethod>
): ReviewMergeMethod {
  if (methods.includes("squash")) return "squash"
  return methods[0] ?? "squash"
}

export function mergeMethodLabel(method: ReviewMergeMethod): string {
  if (method === "merge") return m.reviews_merge_method_merge()
  if (method === "rebase") return m.reviews_merge_method_rebase()
  return m.reviews_merge_method_squash()
}

export function blockReason(reason: MergeDisabledReason | null): string | null {
  if (reason === null) return null
  return mergeDisabledReasonLabel(reason)
}

export function mergeDisabledReasonLabel(reason: MergeDisabledReason): string {
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

export function closeDisabledReasonLabel(reason: CloseDisabledReason): string {
  if (reason === "personal_github_required") {
    return m.reviews_disabled_personal_github_required()
  }
  if (reason === "insufficient_permission") {
    return m.reviews_disabled_insufficient_permission()
  }
  return m.reviews_disabled_pr_not_open()
}

export function reopenDisabledReasonLabel(
  reason: ReopenDisabledReason
): string {
  if (reason === "personal_github_required") {
    return m.reviews_disabled_personal_github_required()
  }
  if (reason === "insufficient_permission") {
    return m.reviews_disabled_insufficient_permission()
  }
  if (reason === "pr_merged") return m.reviews_disabled_pr_merged()
  return m.reviews_disabled_pr_not_closed()
}
