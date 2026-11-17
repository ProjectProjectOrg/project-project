import {
  extractAttachmentRefs,
  type ProjectScope,
  type TicketDescription
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as Attachments from "../attachments/Attachments"
import * as Library from "../library/Library"
import * as TicketDocs from "./TicketDocs"

const make = Effect.gen(function* () {
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

export class TicketDescriber extends Context.Service<
  TicketDescriber,
  Effect.Success<typeof make>
>()("@pp/server-core/tickets/TicketDescriber") {}

export const layer = Layer.effect(TicketDescriber, make)
