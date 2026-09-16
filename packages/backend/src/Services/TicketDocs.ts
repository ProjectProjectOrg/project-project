import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"
import {
  PullRequestState,
  TagName,
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType,
  type NotFound
} from "@projectproject/shared"
import type { MarkdownError, TicketIdTaken } from "./Markdown"

const TicketFrontmatterOnDisk = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  priority: TicketPriority.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("med" as const))
  ),
  tags: Schema.Array(TagName).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  branch: Schema.NullOr(Schema.String),
  branchAutoLinkDisabled: Schema.optionalKey(Schema.Boolean),
  pr: Schema.NullOr(Schema.Finite).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  prState: Schema.NullOr(PullRequestState).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  lastTransitionedPr: Schema.NullOr(Schema.Finite).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  assignees: Schema.optionalKey(Schema.Array(Schema.String)),
  assignee: Schema.optionalKey(Schema.NullOr(Schema.String)),
  archivedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  splitFrom: Schema.optionalKey(TicketId),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedBy: Schema.optionalKey(Schema.String),
  updatedAt: Schema.DateFromString
})

const TicketFrontmatterValue = Schema.Struct(
  Struct.evolve(Struct.omit(TicketFrontmatterOnDisk.fields, ["assignee"]), {
    branchAutoLinkDisabled: () => Schema.optional(Schema.Boolean),
    assignees: () => Schema.Array(Schema.String),
    splitFrom: () => Schema.optional(TicketId),
    updatedBy: () => Schema.String
  })
)

export const TicketFrontmatter = TicketFrontmatterOnDisk.pipe(
  Schema.decodeTo(
    Schema.toType(TicketFrontmatterValue),
    SchemaTransformation.transform({
      decode: (input) =>
        Object.assign(
          Struct.omit(input, [
            "assignee",
            "assignees",
            "updatedBy",
            "splitFrom"
          ]),
          {
            assignees:
              input.assignees ??
              (input.assignee === undefined || input.assignee === null
                ? []
                : [input.assignee]),
            updatedBy: input.updatedBy ?? input.createdBy,
            ...(input.splitFrom ? { splitFrom: input.splitFrom } : {})
          }
        ),
      encode: (input) =>
        Object.assign(
          Struct.omit(input, ["branchAutoLinkDisabled", "splitFrom"]),
          input.branchAutoLinkDisabled
            ? { branchAutoLinkDisabled: true as const }
            : {},
          input.splitFrom ? { splitFrom: input.splitFrom } : {}
        )
    })
  )
)
export type TicketFrontmatter = typeof TicketFrontmatter.Type

export class MalformedTicketDocument extends Data.TaggedError(
  "MalformedTicketDocument"
)<{
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: string
  readonly path: string
  readonly reason: string
  readonly cause: unknown
}> {}

export interface TicketDocument extends TicketFrontmatter {
  readonly body: string
  readonly commentsRegion: string
}

export interface TicketDocsShape {
  readonly listIds: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<TicketId>, MarkdownError>
  readonly read: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<
    TicketDocument,
    NotFound | MarkdownError | MalformedTicketDocument
  >
  readonly create: (
    orgSlug: string,
    slug: string,
    document: TicketDocument,
    onPersist?: (document: TicketDocument) => Effect.Effect<void>
  ) => Effect.Effect<void, MarkdownError | TicketIdTaken>
  readonly write: (
    orgSlug: string,
    slug: string,
    id: string,
    document: TicketDocument
  ) => Effect.Effect<void, MarkdownError>
  readonly update: <E, R>(
    orgSlug: string,
    slug: string,
    id: string,
    transform: (
      document: TicketDocument
    ) => Effect.Effect<TicketDocument, E, R>,
    onPersist?: (document: TicketDocument) => Effect.Effect<void, E, R>
  ) => Effect.Effect<
    TicketDocument,
    NotFound | MarkdownError | MalformedTicketDocument | E,
    R
  >
  readonly remove: (
    orgSlug: string,
    slug: string,
    id: string,
    onPersist?: Effect.Effect<void>
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly readRaw: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<
    { path: string; content: string },
    NotFound | MarkdownError
  >
}

export class TicketDocs extends Context.Service<TicketDocs, TicketDocsShape>()(
  "@projectproject/backend/Services/TicketDocs"
) {}
