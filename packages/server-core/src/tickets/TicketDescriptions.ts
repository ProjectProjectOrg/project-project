import { Db } from "@pp/db"
import {
  ActivityActor,
  type Conflict,
  extractAttachmentRefs,
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

import * as Attachments from "../attachments/Attachments"
import * as Library from "../library/Library"
import type * as Markdown from "../markdown/Markdown"
import { descriptionRevisions } from "./descriptionRevisions"
import * as TicketCommands from "./TicketCommands"
import * as TicketDocs from "./TicketDocs"
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

export const makeDescriber = Effect.gen(function* () {
  const ticketDocs = yield* TicketDocs.TicketDocs
  const library = yield* Library.Library
  const attachments = yield* Attachments.Attachments
  return Effect.fnUntraced(function* (
    scope: ProjectScope["Service"],
    id: string,
    revision: string
  ) {
    const document = yield* ticketDocs.read(scope.orgSlug, scope.slug, id)
    const body = yield* library.resolveSynced(
      scope.orgSlug,
      scope.slug,
      document.body
    )
    const missingAttachments = yield* attachments.missingIds(
      scope.orgSlug,
      extractAttachmentRefs(body)
        .filter((ref) => ref.orgSlug === scope.orgSlug)
        .map((ref) => ref.id)
    )
    return {
      id: document.id,
      body,
      revision,
      missingAttachments
    } satisfies TicketDescription
  })
})

const make = Effect.gen(function* () {
  const db = yield* Db
  const describe = yield* makeDescriber
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
