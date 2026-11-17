import { Db } from "@pp/db"
import {
  ActivityActor,
  type Conflict,
  type Forbidden,
  type MentionInvalid,
  NO_DESCRIPTION_REVISION,
  ProjectScope,
  type SprintCompletedImmutable,
  type TicketDescription,
  type UpdateTicketDescriptionInput,
  type Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type * as Markdown from "../markdown/Markdown"
import { descriptionRevisions } from "./descriptionRevisions"
import * as TicketCommands from "./TicketCommands"
import * as TicketDescriber from "./TicketDescriber"
import type * as TicketDocs from "./TicketDocs"
import type { TicketReadError } from "./ticketPresentation"

export class TicketDescriptions extends Context.Service<
  TicketDescriptions,
  Readonly<{
    read: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<
      ReadonlyArray<TicketDescription>,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
      ProjectScope
    >
    update: (
      id: string,
      input: UpdateTicketDescriptionInput
    ) => Effect.Effect<
      TicketDescription,
      | Forbidden
      | TicketReadError
      | Validation
      | MentionInvalid
      | Conflict
      | SprintCompletedImmutable,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/tickets/TicketDescriptions") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const describe = yield* TicketDescriber.TicketDescriber
  const commands = yield* TicketCommands.TicketCommands

  const read = Effect.fn("TicketDescriptions.read")(function* (
    ids: ReadonlyArray<string>
  ) {
    const scope = yield* ProjectScope
    const revisions = yield* descriptionRevisions(scope.projectId, ids).pipe(
      Effect.provideService(Db, db)
    )
    const found = yield* Effect.forEach(
      [...revisions],
      ([id, revision]) =>
        describe(scope, id, revision).pipe(
          Effect.catchTag("NotFound", () => Effect.succeed(null))
        ),
      { concurrency: 8 }
    )
    return found.filter((description) => description !== null)
  })

  const update = Effect.fn("TicketDescriptions.update")(function* (
    id: string,
    input: UpdateTicketDescriptionInput
  ) {
    const scope = yield* ProjectScope
    yield* commands.update(id, { body: input.body }, undefined, {
      descriptionRevision: input.base
    })
    const revisions = yield* descriptionRevisions(scope.projectId, [id]).pipe(
      Effect.provideService(Db, db)
    )
    return yield* describe(
      scope,
      id,
      revisions.get(id) ?? NO_DESCRIPTION_REVISION
    )
  })

  return TicketDescriptions.of({ read, update })
})

export const layer = Layer.effect(TicketDescriptions, make)
