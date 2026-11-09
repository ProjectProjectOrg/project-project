import type { CreateGroupInput, Group, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type CreateSprintDialogRequest = Readonly<{
  orgSlug: string
  projectSlug: string | null
  completeFrom?: Group
  tickets?: ReadonlyArray<TicketId>
}>

export const createSprintDialog = Atom.make<CreateSprintDialogRequest | null>(
  null
).pipe(Atom.keepAlive)

export const createSprintInProject = Api.runtime.fn(
  Effect.fn("createSprintInProject")(function* (
    input: Readonly<{
      orgSlug: string
      slug: string
      payload: CreateGroupInput
    }>
  ) {
    const created = yield* Api.use((client) =>
      client.groups.create({
        params: { orgSlug: input.orgSlug, slug: input.slug },
        payload: { ...input.payload, kind: "sprint" }
      })
    )
    const scope = projectScope(input.orgSlug, input.slug)
    yield* Reactivity.invalidate(
      (input.payload.tickets ?? []).length === 0
        ? [Keys.sprints(scope)]
        : [
            Keys.sprints(scope),
            Keys.sprintMembership(scope),
            Keys.ticketsIn(scope)
          ]
    )
    return created
  })
)
