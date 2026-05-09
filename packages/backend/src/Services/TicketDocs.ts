import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { NotFound, TicketDetail, TicketId } from "@projectproject/shared"
import type { MarkdownError, TicketIdTaken } from "./Markdown"

export type TicketDocument = TicketDetail

export interface TicketDocsShape {
  readonly listIds: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<TicketId>, MarkdownError>
  readonly read: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDocument, NotFound | MarkdownError>
  readonly create: (
    orgSlug: string,
    slug: string,
    document: TicketDocument
  ) => Effect.Effect<void, MarkdownError | TicketIdTaken>
  readonly write: (
    orgSlug: string,
    slug: string,
    id: string,
    document: TicketDocument
  ) => Effect.Effect<void, MarkdownError>
  readonly remove: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<void, NotFound | MarkdownError>
}

export class TicketDocs extends Context.Tag("@projectproject/backend/Services/TicketDocs")<
  TicketDocs,
  TicketDocsShape
>() {}
