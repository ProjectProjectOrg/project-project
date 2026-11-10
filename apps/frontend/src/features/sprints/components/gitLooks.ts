import type { GitState } from "@pp/shared"
import {
  Check,
  X,
  LoaderCircle,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon
} from "lucide-react"

import { m } from "@/paraglide/messages"

export type Look = Readonly<{
  icon: LucideIcon
  tone: string
  label: () => string
}>

export type Checks = "passing" | "failing" | "pending"

export const CHECKS: Readonly<
  Record<
    Checks,
    Readonly<{ icon: LucideIcon; tone: string; label: () => string }>
  >
> = {
  passing: {
    icon: Check,
    tone: "text-state-success",
    label: m.git_stack_checks_passing
  },
  failing: {
    icon: X,
    tone: "text-state-danger",
    label: m.git_stack_checks_failing
  },
  pending: {
    icon: LoaderCircle,
    tone: "text-state-warning",
    label: m.git_stack_checks_pending
  }
}

export const reportedChecks = (checks: string | undefined): Checks | null =>
  checks === "passing" || checks === "failing" || checks === "pending"
    ? checks
    : null

export const needsAttention = (
  checks: Checks | null
): checks is "failing" | "pending" =>
  checks === "failing" || checks === "pending"

export type PullRequest = Extract<
  GitState,
  { tag: "pr_pending" | "pr_open" | "pr_merged" | "pr_closed" }
>

export type PullRequestKind = "open" | "draft" | "merged" | "closed"

export const PULL_REQUEST_LOOKS: Readonly<Record<PullRequestKind, Look>> = {
  open: {
    icon: GitPullRequest,
    tone: "text-state-success",
    label: m.git_stack_state_open
  },
  draft: {
    icon: GitPullRequestDraft,
    tone: "text-muted-foreground",
    label: m.git_stack_state_draft
  },
  merged: {
    icon: GitMerge,
    tone: "text-state-merged",
    label: m.git_stack_state_merged
  },
  closed: {
    icon: GitPullRequestClosed,
    tone: "text-muted-foreground",
    label: m.git_stack_state_closed
  }
}

export const pullRequestKind = (pr: PullRequest): PullRequestKind =>
  pr.tag === "pr_merged"
    ? "merged"
    : pr.tag === "pr_closed"
      ? "closed"
      : pr.tag === "pr_open" && pr.draft
        ? "draft"
        : "open"
