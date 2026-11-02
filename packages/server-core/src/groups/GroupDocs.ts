import {
  type ActivityActor,
  type ActivityCause,
  type GroupDetail,
  GroupId,
  NotFound,
  Group,
  GroupKind,
  TicketId
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { groupMembershipChanges } from "../activity/changes"
import { sprintEvents } from "../activity/projectEvents"
import { TicketActivity } from "../activity/TicketActivity"
import { markdownFileContent } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"

export type GroupDocument = GroupDetail

export type GroupActivityOptions = Readonly<{ cause?: ActivityCause }>

export class GroupDocs extends Context.Service<
  GroupDocs,
  Readonly<{
    listIds: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlyArray<GroupId>, Markdown.MarkdownError>
    read: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<GroupDocument, NotFound | Markdown.MarkdownError>
    create: (
      orgSlug: string,
      slug: string,
      document: GroupDocument
    ) => Effect.Effect<
      void,
      Markdown.MarkdownError | Markdown.GroupIdTaken,
      ActivityActor
    >
    write: (
      orgSlug: string,
      slug: string,
      id: string,
      document: GroupDocument,
      activity?: GroupActivityOptions
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
    writeIfExists: (
      orgSlug: string,
      slug: string,
      id: string,
      document: GroupDocument,
      activity?: GroupActivityOptions
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, ActivityActor>
    remove: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError, ActivityActor>
    readRaw: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<
      { path: string; content: string },
      NotFound | Markdown.MarkdownError
    >
  }>
>()("@pp/server-core/groups/GroupDocs") {}

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

const annotateGroupDoc = <A, E, R>(
  operation: string,
  orgSlug: string,
  slug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const annotations = {
    module: "GroupDocs",
    operation,
    orgSlug,
    slug,
    ...attributes
  }
  return Effect.annotateCurrentSpan(annotations).pipe(
    Effect.andThen(effect),
    Effect.annotateLogs(annotations)
  )
}

const make = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown
  const ticketActivity = yield* TicketActivity

  const listIds = Effect.fn("GroupDocs.listIds")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateGroupDoc(
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
  })

  const read = Effect.fn("GroupDocs.read")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    return yield* annotateGroupDoc(
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
  })

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
      effect,
      sprintEvents(before, after)
    )

  const create = Effect.fn("GroupDocs.create")(function* (
    orgSlug: string,
    slug: string,
    document: GroupDocument
  ) {
    return yield* annotateGroupDoc(
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
  })

  const write = Effect.fn("GroupDocs.write")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    document: GroupDocument,
    activity: GroupActivityOptions = {}
  ) {
    return yield* annotateGroupDoc(
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
  })

  const writeIfExists = Effect.fn("GroupDocs.writeIfExists")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    document: GroupDocument,
    activity: GroupActivityOptions = {}
  ) {
    return yield* annotateGroupDoc(
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
  })

  const remove = Effect.fn("GroupDocs.remove")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    return yield* annotateGroupDoc(
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
  })

  const readRaw = Effect.fn("GroupDocs.readRaw")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    return yield* annotateGroupDoc(
      "readRaw",
      orgSlug,
      slug,
      { groupId: id },
      markdown.readGroupFileRaw(orgSlug, slug, id)
    )
  })

  return GroupDocs.of({
    listIds,
    read,
    create,
    write,
    writeIfExists,
    remove,
    readRaw
  })
})

export const layer = Layer.effect(GroupDocs, make)
