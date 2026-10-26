import type { SaveOrgEmailInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

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
const republishOnFailure =
  (req: EmailRequest) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.tapError(() =>
        Reactivity.invalidate([Keys.orgEmail(req.params.orgSlug)])
      )
    )

export const saveOrgEmail = Atom.family((req: EmailRequest) =>
  viewMutation(orgEmail(req), {
    name: "saveOrgEmail",
    predict: (
      _status,
      { password: _password, ...settings }: SaveOrgEmailInput
    ) => ({
      settings,
      lastTest: null
    }),
    call: (input) =>
      Api.use((client) =>
        client.orgEmail.save({ params: req.params, payload: input })
      ).pipe(republishOnFailure(req)),
    confirm: replaceWith
  })
)

export const testOrgEmail = Atom.family((req: EmailRequest) =>
  viewMutation(orgEmail(req), {
    name: "testOrgEmail",
    predict: (status, _input: void) => status,
    call: () =>
      Api.use((client) => client.orgEmail.test({ params: req.params })).pipe(
        republishOnFailure(req)
      ),
    confirm: replaceWith
  })
)

export const disconnectOrgEmail = Atom.family((req: EmailRequest) =>
  viewMutation(orgEmail(req), {
    name: "disconnectOrgEmail",
    predict: (_status, _input: void) => ({ settings: null, lastTest: null }),
    call: () =>
      Api.use((client) => client.orgEmail.disconnect({ params: req.params })),
    confirm: replaceWith
  })
)
