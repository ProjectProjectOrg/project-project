import { Effect, Layer, Schema } from "effect"
import {
  NotFound,
  TagName,
  TicketId,
  type TicketDetail
} from "@projectproject/shared"
import {
  Markdown,
  type MarkdownError,
  type TicketIdTaken
} from "../Services/Markdown"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../Services/TicketDocs"

const TicketFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: Schema.Literal("todo", "in_progress", "done"),
  type: Schema.Literal("feat", "bug", "chore", "other"),
  priority: Schema.optionalWith(Schema.Literal("low", "med", "high"), {
    default: () => "med" as const
  }),
  tags: Schema.optionalWith(Schema.Array(TagName), {
    default: () => []
  }),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  lastTransitionedPr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  assignees: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  }),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})

const decodeFrontmatter = Schema.decodeUnknown(TicketFrontmatter)
const decodeTicketId = Schema.decodeUnknown(TicketId)

function decodeFrontmatterCompat(raw: unknown) {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>
    if (record.assignees === undefined && "assignee" in record) {
      const legacy = record.assignee
      record.assignees = typeof legacy === "string" ? [legacy] : []
    }
  }
  return decodeFrontmatter(raw)
}

function frontmatterToDisk(document: TicketDocument): Record<string, unknown> {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    type: document.type,
    priority: document.priority,
    tags: document.tags,
    branch: document.branch,
    pr: document.pr,
    lastTransitionedPr: document.lastTransitionedPr,
    assignees: document.assignees,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  }
}

function toDocument(
  frontmatter: typeof TicketFrontmatter.Type,
  body: string
): TicketDetail {
  return {
    ...frontmatter,
    body
  }
}

export const TicketDocsLive = Layer.effect(
  TicketDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown

    const listIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<TicketId>, MarkdownError> =>
      markdown
        .listTicketIds(orgSlug, slug)
        .pipe(
          Effect.flatMap((ids) =>
            Effect.forEach(ids, (id) => decodeTicketId(id).pipe(Effect.orDie))
          )
        )

    const read = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDocument, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const file = yield* markdown.readTicketFile(orgSlug, slug, id)
        const frontmatter = yield* decodeFrontmatterCompat(file.data).pipe(
          Effect.orDie
        )
        return toDocument(frontmatter, file.body)
      })

    const create = (
      orgSlug: string,
      slug: string,
      document: TicketDocument
    ): Effect.Effect<void, MarkdownError | TicketIdTaken> =>
      markdown.createTicketFile(
        orgSlug,
        slug,
        document.id,
        frontmatterToDisk(document),
        document.body
      )

    const write = (
      orgSlug: string,
      slug: string,
      id: string,
      document: TicketDocument
    ): Effect.Effect<void, MarkdownError> =>
      markdown.writeTicketFile(
        orgSlug,
        slug,
        id,
        frontmatterToDisk(document),
        document.body
      )

    const remove = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      markdown.removeTicketFile(orgSlug, slug, id)

    return { listIds, read, create, write, remove } satisfies TicketDocsShape
  })
)
