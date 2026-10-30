import type { GitAutomation, UpdateGitAutomationInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { coalescingMutation, replaceWith } from "@/api/viewMutation"

export type GitAutomationRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const gitAutomationRequest = (
  orgSlug: string,
  slug: string
): GitAutomationRequest => ({ params: { orgSlug, slug } })

const scopeOf = (req: GitAutomationRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const gitAutomationQuery = (req: GitAutomationRequest) =>
  query("gitAutomation", "get", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.gitAutomation(scopeOf(req)),
      Keys.statuses(scopeOf(req))
    ]
  })

export const gitAutomationFor = Atom.family((req: GitAutomationRequest) =>
  Atom.optimistic(gitAutomationQuery(req))
)

export const updateGitAutomation = Atom.family((req: GitAutomationRequest) =>
  coalescingMutation(gitAutomationFor(req), {
    name: "updateGitAutomation",
    idleTTL: "5 minutes",
    predict: (value, input: UpdateGitAutomationInput): GitAutomation => ({
      rules: { ...value.rules, ...input.rules },
      forwardOnly: input.forwardOnly ?? value.forwardOnly
    }),
    merge: (pending, next) => {
      const merged = { ...pending, ...next }
      if (pending.rules === undefined && next.rules === undefined) return merged
      return { ...merged, rules: { ...pending.rules, ...next.rules } }
    },
    call: (client, input) =>
      client.gitAutomation.update({ params: req.params, payload: input }),
    confirm: replaceWith
  })
)
