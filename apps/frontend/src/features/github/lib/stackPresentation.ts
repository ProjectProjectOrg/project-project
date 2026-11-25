import type { GitState, TicketDetail, StackLayerState } from "@pp/shared"
import {
  AlertTriangle,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type IconType
} from "@pp/ui/icons"
import * as Match from "effect/Match"

import { m } from "@/paraglide/messages"

type LayerTone = "draft" | "open" | "merged" | "closed" | "none" | "deleted"

export const layerTone = (layer: StackLayerState) => {
  if (layer.deleted) return "deleted"
  if (layer.pr === null) return "none"
  if (layer.pr.state === "merged") return "merged"
  if (layer.pr.state === "closed") return "closed"
  return layer.pr.draft ? "draft" : "open"
}

export const TONES: Readonly<
  Record<
    LayerTone,
    Readonly<{ icon: IconType; className: string; label: () => string }>
  >
> = {
  draft: {
    icon: GitPullRequestDraft,
    className: "text-muted-foreground",
    label: m.git_stack_state_draft
  },
  open: {
    icon: GitPullRequest,
    className: "text-state-success",
    label: m.git_stack_state_open
  },
  merged: {
    icon: GitMerge,
    className: "text-state-merged",
    label: m.git_stack_state_merged
  },
  closed: {
    icon: GitPullRequestClosed,
    className: "text-muted-foreground",
    label: m.git_stack_state_closed
  },
  none: {
    icon: GitBranch,
    className: "text-muted-foreground",
    label: m.git_stack_state_no_pr
  },
  deleted: {
    icon: AlertTriangle,
    className: "text-state-warning",
    label: m.git_stack_state_deleted
  }
}

export const stackPullRequestCount = (
  own: GitState | null,
  stack: ReadonlyArray<StackLayerState>
) => {
  const ownPr =
    own === null
      ? []
      : own.tag === "pr_merged"
        ? ["merged"]
        : own.tag === "pr_open" ||
            own.tag === "pr_pending" ||
            own.tag === "pr_closed"
          ? ["other"]
          : []
  const layers = stack.flatMap((layer) =>
    layer.pr === null ? [] : [layer.pr.state]
  )
  const all = [...ownPr, ...layers]
  return {
    merged: all.filter((state) => state === "merged").length,
    total: all.length
  }
}

export const stackSummary = (
  own: GitState,
  stack: ReadonlyArray<StackLayerState>
) => {
  const checks = [
    ...(own.tag === "pr_open" ? [own.checks] : []),
    ...stack.flatMap((layer) =>
      layer.pr?.checks && layerTone(layer) !== "merged" ? [layer.pr.checks] : []
    )
  ]
  return {
    count: stackPullRequestCount(own, stack),
    worstChecks:
      checks.find((check) => check === "failing") ??
      checks.find((check) => check === "pending") ??
      checks.find((check) => check === "passing"),
    anyOpen:
      own.tag === "pr_open" ||
      stack.some((layer) => {
        const tone = layerTone(layer)
        return tone === "open" || tone === "draft"
      })
  }
}

const pendingPr = (number: number, url: string) => ({
  number,
  url,
  title: "",
  state: "open" as const,
  draft: false,
  landed: false,
  checks: null
})

const ownRow = (
  branch: string,
  base: string | null,
  pr: StackLayerState["pr"]
) => ({ branch, base, depth: 0, pr, deleted: false })

export const ownLayer = (
  state: GitState,
  ticket: Pick<TicketDetail, "lastTransitionedPr">,
  defaultBase: string
) =>
  Match.value(state).pipe(
    Match.when({ tag: "no_branch" }, () => null),
    Match.when({ tag: "stale_branch" }, (current) => ({
      ...ownRow(current.name, null, null),
      deleted: true
    })),
    Match.when({ tag: "branch_pending" }, (current) =>
      ownRow(current.name, current.baseBranch, null)
    ),
    Match.when({ tag: "branch_no_pr" }, (current) =>
      ownRow(current.name, current.baseBranch ?? defaultBase, null)
    ),
    Match.when({ tag: "pr_pending" }, (current) =>
      ownRow(
        current.branch,
        current.baseBranch,
        pendingPr(current.number, current.url)
      )
    ),
    Match.when({ tag: "pr_open" }, (current) =>
      ownRow(current.branch, current.baseBranch, {
        ...pendingPr(current.number, current.url),
        title: current.title,
        draft: current.draft,
        checks: current.checks
      })
    ),
    Match.when({ tag: "pr_merged" }, (current) =>
      ownRow(current.branch, current.baseBranch, {
        ...pendingPr(current.number, current.url),
        title: current.title,
        state: "merged",
        landed: ticket.lastTransitionedPr === current.number
      })
    ),
    Match.when({ tag: "pr_closed" }, (current) =>
      ownRow(current.branch, current.baseBranch, {
        ...pendingPr(current.number, current.url),
        title: current.title,
        state: "closed"
      })
    ),
    Match.exhaustive
  )
