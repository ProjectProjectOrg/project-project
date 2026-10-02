import type { SaveOrgEmailInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type EmailRequest = Readonly<{ params: Readonly<{ orgSlug: string }> }>
export const emailRequest = (orgSlug: string): EmailRequest => ({
  params: { orgSlug }
})
const emailQuery = (req: EmailRequest) =>
  Api.query("orgEmail", "get", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.orgEmail(req.params.orgSlug)]
  })
export const orgEmail = Atom.family((req: EmailRequest) =>
  Atom.optimistic(emailQuery(req))
)
export const saveOrgEmail = Atom.family((req: EmailRequest) =>
  Atom.optimisticFn(orgEmail(req), {
    reducer: (
      current,
      { password: _password, ...settings }: SaveOrgEmailInput
    ) => Result.map(current, () => ({ settings, lastTest: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("saveOrgEmail")(function* (input: SaveOrgEmailInput) {
          const status = yield* Api.use((client) =>
            client.orgEmail.save({ params: req.params, payload: input })
          )
          set(Result.success(status))
          return status
        })
      )
  })
)
export const testOrgEmail = Atom.family((req: EmailRequest) =>
  Atom.optimisticFn(orgEmail(req), {
    reducer: (current, _input: void) => current,
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("testOrgEmail")(function* (_input: void) {
          const status = yield* Api.use((client) =>
            client.orgEmail.test({ params: req.params })
          ).pipe(
            Effect.tapError(() =>
              Reactivity.invalidate([Keys.orgEmail(req.params.orgSlug)])
            )
          )
          set(Result.success(status))
          return status
        })
      )
  })
)
export const disconnectOrgEmail = Atom.family((req: EmailRequest) =>
  Atom.optimisticFn(orgEmail(req), {
    reducer: (current, _input: void) =>
      Result.map(current, () => ({ settings: null, lastTest: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("disconnectOrgEmail")(function* (_input: void) {
          const status = yield* Api.use((client) =>
            client.orgEmail.disconnect({ params: req.params })
          )
          set(Result.success(status))
          return status
        })
      )
  })
)
