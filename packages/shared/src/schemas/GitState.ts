// GitState — per-ticket view of branch + PR state, fetched from GitHub.
//
// The `tag` discriminates the variants. Each renders a distinct UI state
// in the ticket list git column and the ticket detail panel:
//
//   no_branch         — ticket has no branch in frontmatter
//   branch_no_pr      — branch exists upstream, no PR yet (ahead count omitted
//                       for PoC; we don't pay for a per-branch compare)
//   pr_open           — open PR, possibly draft, with checks status
//   pr_merged         — PR was merged
//   pr_closed         — PR was closed without merging
//   stale_branch      — frontmatter has a branch name, branch isn't on remote
//
// All variants carry just enough to render the chip without a follow-up call.

import { Schema } from "effect"

export const ChecksStatus = Schema.Literal(
  "passing",
  "failing",
  "pending",
  "neutral",
  "none"
)
export type ChecksStatus = typeof ChecksStatus.Type

const NoBranch = Schema.Struct({
  tag: Schema.Literal("no_branch")
})

const BranchNoPr = Schema.Struct({
  tag: Schema.Literal("branch_no_pr"),
  name: Schema.String,
  baseBranch: Schema.String
})

const PrOpen = Schema.Struct({
  tag: Schema.Literal("pr_open"),
  branch: Schema.String,
  baseBranch: Schema.String,
  number: Schema.Number,
  url: Schema.String,
  draft: Schema.Boolean,
  title: Schema.String,
  checks: ChecksStatus
})

const PrMerged = Schema.Struct({
  tag: Schema.Literal("pr_merged"),
  branch: Schema.String,
  baseBranch: Schema.String,
  number: Schema.Number,
  url: Schema.String,
  title: Schema.String,
  mergedAt: Schema.Date
})

const PrClosed = Schema.Struct({
  tag: Schema.Literal("pr_closed"),
  branch: Schema.String,
  baseBranch: Schema.String,
  number: Schema.Number,
  url: Schema.String,
  title: Schema.String
})

const StaleBranch = Schema.Struct({
  tag: Schema.Literal("stale_branch"),
  name: Schema.String
})

export const GitState = Schema.Union(
  NoBranch,
  BranchNoPr,
  PrOpen,
  PrMerged,
  PrClosed,
  StaleBranch
)
export type GitState = typeof GitState.Type

// Wire shape returned by /projects/:slug/git-states. The two status fields
// let the frontend flip the header chip to "Reconnect GitHub" / "Repo gone"
// without inspecting per-ticket entries.
export const GitStateTokenStatus = Schema.Literal(
  "ok",
  "expired",
  "scope_insufficient"
)
export type GitStateTokenStatus = typeof GitStateTokenStatus.Type

export const GitStateRepoStatus = Schema.Literal("ok", "gone", "not_connected")
export type GitStateRepoStatus = typeof GitStateRepoStatus.Type

// Records a successful auto-transition that just happened, so the frontend
// can show a "T-12 → done (PR #42 merged)" toast.
export const TransitionRecord = Schema.Struct({
  ticketId: Schema.String,
  fromStatus: Schema.Literal("todo", "in_progress", "done"),
  toStatus: Schema.Literal("todo", "in_progress", "done"),
  prNumber: Schema.Number
})
export type TransitionRecord = typeof TransitionRecord.Type

export const GitStatesResponse = Schema.Struct({
  states: Schema.Record({ key: Schema.String, value: GitState }),
  transitioned: Schema.Array(TransitionRecord),
  tokenStatus: GitStateTokenStatus,
  repoStatus: GitStateRepoStatus
})
export type GitStatesResponse = typeof GitStatesResponse.Type

// Inputs for branch/PR mutations.
export const CreateBranchInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  baseBranch: Schema.optional(Schema.String)
})
export type CreateBranchInput = typeof CreateBranchInput.Type

export const OpenPrInput = Schema.Struct({
  title: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))
  ),
  body: Schema.optional(Schema.String),
  draft: Schema.optional(Schema.Boolean)
})
export type OpenPrInput = typeof OpenPrInput.Type

export const OpenPrResult = Schema.Struct({
  number: Schema.Number,
  url: Schema.String
})
export type OpenPrResult = typeof OpenPrResult.Type
