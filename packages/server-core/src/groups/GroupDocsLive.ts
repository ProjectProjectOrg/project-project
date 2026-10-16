import {
  Group,
  GroupId,
  GroupKind,
  NotFound,
  TicketId,
  type ActivityActor,
  type GroupDetail
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { groupMembershipChanges } from "../activity/changes"
import { TicketActivity } from "../activity/TicketActivity"
import { markdownFileContent } from "../markdown/fileContent"
import {
  Markdown,
  type GroupIdTaken,
  type MarkdownError
} from "../markdown/Markdown"
import {
  GroupDocs,
  type GroupActivityOptions,
  type GroupDocsShape,
  type GroupDocument
} from "./GroupDocs"

const GroupFrontmatter = Schema.Struct({
  ...Group.fields,
  kind: GroupKind.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("other" as const))
  ),
  tickets: Schema.Array(TicketId).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  startsAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  endsAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  completedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})

const decodeFrontmatter = Schema.decodeUnknownEffect(GroupFrontmatter)
const encodeFrontmatter = Schema.encodeSync(GroupFrontmatter)
const decodeGroupId = Schema.decodeUnknownEffect(GroupId)

function toDocument(
  group: typeof GroupFrontmatter.Type,
  body: string
): GroupDetail {
  return { ...group, body }
}

function withGroupDocTelemetry<A, E, R>(
  operation: string,
  orgSlug: string,
  slug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  const annotations = {
    module: "GroupDocs",
    operation,
    orgSlug,
    slug,
    ...attributes
  }
  return effect.pipe(
    Effect.withSpan(`GroupDocs.${operation}`, { attributes: annotations }),
    Effect.annotateLogs(annotations)
  )
}

export const GroupDocsLive = Layer.effect(
  GroupDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown
    const ticketActivity = yield* TicketActivity

    const listIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<GroupId>, MarkdownError> =>
      withGroupDocTelemetry(
        "listIds",
        orgSlug,
        slug,
        {},
        markdown
          .listGroupIds(orgSlug, slug)
          .pipe(
            Effect.flatMap((ids) =>
              Effect.forEach(ids, (id) => decodeGroupId(id).pipe(Effect.orDie))
            )
          )
      )

    const read = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<GroupDocument, NotFound | MarkdownError> =>
      withGroupDocTelemetry(
        "read",
        orgSlug,
        slug,
        { groupId: id },
        Effect.gen(function* () {
          const file = yield* markdown.readGroupFile(orgSlug, slug, id)
          const group = yield* decodeFrontmatter(file.data).pipe(Effect.orDie)
          return toDocument(group, file.body)
        })
      )

    const previous = (orgSlug: string, slug: string, id: string) =>
      read(orgSlug, slug, id).pipe(
        Effect.catchTag("NotFound", () => Effect.succeed(null))
      )

    const recordMembership = <A, E>(
      orgSlug: string,
      slug: string,
      id: string,
      before: GroupDocument | null,
      after: GroupDocument | null,
      activity: GroupActivityOptions,
      effect: Effect.Effect<A, E>
    ): Effect.Effect<A, E, ActivityActor> =>
      ticketActivity.record(
        orgSlug,
        slug,
        {
          kind: "group",
          id,
          content:
            after === null
              ? null
              : markdownFileContent(encodeFrontmatter(after), after.body)
        },
        groupMembershipChanges(before, after),
        activity.cause ?? null,
        effect
      )

    const create = (
      orgSlug: string,
      slug: string,
      document: GroupDocument
    ): Effect.Effect<void, MarkdownError | GroupIdTaken, ActivityActor> =>
      withGroupDocTelemetry(
        "create",
        orgSlug,
        slug,
        { groupId: document.id },
        recordMembership(
          orgSlug,
          slug,
          document.id,
          null,
          document,
          {},
          markdown.createGroupFile(
            orgSlug,
            slug,
            document.id,
            encodeFrontmatter(document),
            document.body
          )
        )
      )

    const write = (
      orgSlug: string,
      slug: string,
      id: string,
      document: GroupDocument,
      activity: GroupActivityOptions = {}
    ): Effect.Effect<void, MarkdownError, ActivityActor> =>
      withGroupDocTelemetry(
        "write",
        orgSlug,
        slug,
        { groupId: id },
        Effect.gen(function* () {
          const before = yield* previous(orgSlug, slug, id)
          yield* recordMembership(
            orgSlug,
            slug,
            id,
            before,
            document,
            activity,
            markdown.writeGroupFile(
              orgSlug,
              slug,
              id,
              encodeFrontmatter(document),
              document.body
            )
          )
        })
      )

    const writeIfExists = (
      orgSlug: string,
      slug: string,
      id: string,
      document: GroupDocument,
      activity: GroupActivityOptions = {}
    ): Effect.Effect<void, NotFound | MarkdownError, ActivityActor> =>
      withGroupDocTelemetry(
        "writeIfExists",
        orgSlug,
        slug,
        { groupId: id },
        Effect.gen(function* () {
          const before = yield* previous(orgSlug, slug, id)
          if (before === null) return yield* new NotFound()
          return yield* recordMembership(
            orgSlug,
            slug,
            id,
            before,
            document,
            activity,
            markdown.writeGroupFileIfExists(
              orgSlug,
              slug,
              id,
              encodeFrontmatter(document),
              document.body
            )
          )
        })
      )

    const remove = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError, ActivityActor> =>
      withGroupDocTelemetry(
        "remove",
        orgSlug,
        slug,
        { groupId: id },
        Effect.gen(function* () {
          const before = yield* previous(orgSlug, slug, id)
          yield* recordMembership(
            orgSlug,
            slug,
            id,
            before,
            null,
            { cause: "group_deleted" },
            markdown.removeGroupFile(orgSlug, slug, id)
          )
        })
      )

    const readRaw = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      { path: string; content: string },
      NotFound | MarkdownError
    > =>
      withGroupDocTelemetry(
        "readRaw",
        orgSlug,
        slug,
        { groupId: id },
        markdown.readGroupFileRaw(orgSlug, slug, id)
      )

    return {
      listIds,
      read,
      create,
      write,
      writeIfExists,
      remove,
      readRaw
    } satisfies GroupDocsShape
  })
)
