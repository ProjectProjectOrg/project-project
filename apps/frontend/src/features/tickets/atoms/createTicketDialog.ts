import type { CreateTicketInput, GroupId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type CreateTicketDialogRequest = Readonly<{
  orgSlug: string
  projectSlug: string | null
  sprint?: GroupId
  title?: string
}>

export const createTicketDialog = Atom.make<CreateTicketDialogRequest | null>(
  null
).pipe(Atom.keepAlive)

export type CreateTicketDialogInput = Readonly<{
  orgSlug: string
  slug: string
  payload: CreateTicketInput
}>

export const createTicketInProject = Api.runtime.fn(
  Effect.fn("createTicketInProject")(function* (
    input: CreateTicketDialogInput
  ) {
    const created = yield* Api.use((client) =>
      client.tickets.create({
        params: { orgSlug: input.orgSlug, slug: input.slug },
        payload: input.payload
      })
    )
    yield* Reactivity.invalidate(
      Keys.ticketsChanged(projectScope(input.orgSlug, input.slug))
    )
    return created
  })
)
