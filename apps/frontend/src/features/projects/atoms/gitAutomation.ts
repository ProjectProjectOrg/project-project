import type { GitAutomation, UpdateGitAutomationInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

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
  Api.query("gitAutomation", "get", {
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
  viewMutation(gitAutomationFor(req), {
    name: "updateGitAutomation",
    predict: (value, input: UpdateGitAutomationInput): GitAutomation => ({
      rules: { ...value.rules, ...input.rules },
      forwardOnly: input.forwardOnly ?? value.forwardOnly
    }),
    call: (input) =>
      Api.use((client) =>
        client.gitAutomation.update({ params: req.params, payload: input })
      ),
    confirm: replaceWith
  })
)
