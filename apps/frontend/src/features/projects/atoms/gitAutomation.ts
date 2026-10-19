import type { GitAutomation, UpdateGitAutomationInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

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
  Atom.optimisticFn(gitAutomationFor(req), {
    reducer: (current, input: UpdateGitAutomationInput) =>
      AsyncResult.map(
        current,
        (value): GitAutomation => ({
          rules: { ...value.rules, ...input.rules },
          forwardOnly: input.forwardOnly ?? value.forwardOnly
        })
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("updateGitAutomation")(function* (
          input: UpdateGitAutomationInput
        ) {
          const saved = yield* Api.use((client) =>
            client.gitAutomation.update({ params: req.params, payload: input })
          )
          set(AsyncResult.success(saved))
          return saved
        })
      )
  })
)
