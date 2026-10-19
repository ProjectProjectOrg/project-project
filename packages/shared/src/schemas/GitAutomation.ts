import * as Schema from "effect/Schema"

import { StatusSlug } from "./Status"

export const GIT_AUTOMATION_EVENTS = [
  "branch_linked",
  "pr_draft_opened",
  "pr_opened",
  "pr_merged",
  "pr_closed",
  "branch_deleted"
] as const

export const GitAutomationEvent = Schema.Literals(GIT_AUTOMATION_EVENTS)
export type GitAutomationEvent = typeof GitAutomationEvent.Type

const ruleTarget = Schema.NullOr(StatusSlug)

export const GitAutomationRules = Schema.Struct({
  branch_linked: ruleTarget,
  pr_draft_opened: ruleTarget,
  pr_opened: ruleTarget,
  pr_merged: ruleTarget,
  pr_closed: ruleTarget,
  branch_deleted: ruleTarget
})
export type GitAutomationRules = typeof GitAutomationRules.Type

export const GitAutomation = Schema.Struct({
  rules: GitAutomationRules,
  forwardOnly: Schema.Boolean
})
export type GitAutomation = typeof GitAutomation.Type

export const UpdateGitAutomationInput = GitAutomation
export type UpdateGitAutomationInput = typeof UpdateGitAutomationInput.Type

export const GIT_AUTOMATION_SEED = [
  { event: "pr_merged", statusSlug: "done" }
] as const satisfies ReadonlyArray<
  Readonly<{ event: GitAutomationEvent; statusSlug: string }>
>
