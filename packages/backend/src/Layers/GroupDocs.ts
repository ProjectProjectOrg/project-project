import { Effect, Layer, Schema } from "effect"
import {
  Group,
  GroupId,
  GroupKind,
  NotFound,
  TicketId,
  type GroupDetail
} from "@projectproject/shared"
import {
  Markdown,
  type GroupIdTaken,
  type MarkdownError
} from "../Services/Markdown"
import {
  GroupDocs,
  type GroupDocsShape,
  type GroupDocument
} from "../Services/GroupDocs"

const GroupFrontmatter = Schema.Struct({
  ...Group.fields,
  kind: Schema.optionalWith(GroupKind, { default: () => "other" as const }),
  tickets: Schema.optionalWith(Schema.Array(TicketId), { default: () => [] }),
  startsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  endsAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  }),
  completedAt: Schema.optionalWith(Schema.NullOr(Schema.Date), {
    default: () => null
  })
})

const decodeFrontmatter = Schema.decodeUnknown(GroupFrontmatter)
const decodeGroupId = Schema.decodeUnknown(GroupId)

function frontmatterToDisk(document: GroupDocument): Record<string, unknown> {
  return {
    id: document.id,
    name: document.name,
    kind: document.kind,
    tickets: document.tickets,
    color: document.color,
    startsAt: document.startsAt ? document.startsAt.toISOString() : null,
    endsAt: document.endsAt ? document.endsAt.toISOString() : null,
    completedAt: document.completedAt
      ? document.completedAt.toISOString()
      : null,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  }
}

function toDocument(
  group: typeof GroupFrontmatter.Type,
  body: string
): GroupDetail {
  return { ...group, body }
}

export const GroupDocsLive = Layer.effect(
  GroupDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown

    const listIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<GroupId>, MarkdownError> =>
      markdown
        .listGroupIds(orgSlug, slug)
        .pipe(
          Effect.flatMap((ids) =>
            Effect.forEach(ids, (id) => decodeGroupId(id).pipe(Effect.orDie))
          )
        )

    const read = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<GroupDocument, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const file = yield* markdown.readGroupFile(orgSlug, slug, id)
        const group = yield* decodeFrontmatter(file.data).pipe(Effect.orDie)
        return toDocument(group, file.body)
      })

    const create = (
      orgSlug: string,
      slug: string,
      document: GroupDocument
    ): Effect.Effect<void, MarkdownError | GroupIdTaken> =>
      markdown.createGroupFile(
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
      document: GroupDocument
    ): Effect.Effect<void, MarkdownError> =>
      markdown.writeGroupFile(
        orgSlug,
        slug,
        id,
        frontmatterToDisk(document),
        document.body
      )

    const writeIfExists = (
      orgSlug: string,
      slug: string,
      id: string,
      document: GroupDocument
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      markdown.writeGroupFileIfExists(
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
      markdown.removeGroupFile(orgSlug, slug, id)

    return {
      listIds,
      read,
      create,
      write,
      writeIfExists,
      remove
    } satisfies GroupDocsShape
  })
)
