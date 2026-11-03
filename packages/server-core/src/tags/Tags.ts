import { Db } from "@pp/db"
import { projectTag } from "@pp/db/schema"
import {
  type ActivityActor,
  Conflict,
  type CreateTagInput,
  type CursorPayload,
  NotFound,
  paginateSorted,
  ProjectScope,
  Tag,
  TagColor,
  TagName,
  TAG_DEFAULT_PALETTE,
  type UpdateTagInput
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import * as TicketRewrites from "../tickets/TicketRewrites"

export class Tags extends Context.Service<
  Tags,
  Readonly<{
    list: () => Effect.Effect<ReadonlyArray<Tag>, never, ProjectScope>
    listPaged: (
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      { items: ReadonlyArray<Tag>; nextCursor: string | null },
      never,
      ProjectScope
    >
    create: (
      input: CreateTagInput
    ) => Effect.Effect<Tag, NotFound | Conflict, ProjectScope>
    update: (
      name: string,
      patch: UpdateTagInput
    ) => Effect.Effect<
      Tag,
      NotFound | Conflict | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    remove: (
      name: string
    ) => Effect.Effect<
      void,
      NotFound | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/tags/Tags") {}

const makeTagName = Schema.decodeUnknownSync(TagName)
const makeTagColor = Schema.decodeUnknownSync(TagColor)

function pickColor(used: ReadonlyArray<string>): TagColor {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return makeTagColor(c)
  return makeTagColor(
    TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
  )
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const rewrites = yield* TicketRewrites.TicketRewrites

  const list = Effect.fn("Tags.list")(function* () {
    const { projectId } = yield* ProjectScope
    const rows = yield* db.query.projectTag
      .findMany({
        where: {
          RAW: (table, _operators) => _operators.eq(table.projectId, projectId)
        }
      })
      .pipe(Effect.orDie)
    return rows.map(
      (r): Tag => ({
        name: makeTagName(r.name),
        color: makeTagColor(r.color),
        createdBy: r.createdBy,
        createdAt: r.createdAt
      })
    )
  })

  const listPaged = Effect.fn("Tags.listPaged")(function* (
    cursor: CursorPayload | undefined,
    limit: number
  ) {
    const all = yield* list()
    const sorted = [...all].toSorted((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    )
    return paginateSorted(sorted, {
      cursor,
      limit,
      sortKey: (t) => t.name,
      id: (t) => t.name
    })
  })

  const create = Effect.fn("Tags.create")(function* (input: CreateTagInput) {
    const { userId, projectId } = yield* ProjectScope

    const existing = yield* db.query.projectTag
      .findMany({
        columns: { name: true, color: true },
        where: {
          RAW: (table, _operators) => _operators.eq(table.projectId, projectId)
        }
      })
      .pipe(Effect.orDie)
    if (existing.some((tag) => tag.name === input.name)) {
      return yield* new Conflict({ reason: "tag_exists" })
    }

    const color = input.color ?? pickColor(existing.map((e) => e.color))

    const inserted = yield* db
      .insert(projectTag)
      .values({
        projectId,
        name: input.name,
        color,
        createdBy: userId
      })
      .returning()
      .pipe(Effect.orDie)
    const row = inserted[0]
    return {
      name: makeTagName(row.name),
      color: makeTagColor(row.color),
      createdBy: row.createdBy,
      createdAt: row.createdAt
    }
  })

  const update = Effect.fn("Tags.update")(function* (
    name: string,
    patch: UpdateTagInput
  ) {
    const { orgSlug, slug, projectId } = yield* ProjectScope

    const existing = yield* db.query.projectTag
      .findFirst({
        where: {
          RAW: (table, _operators) =>
            _operators.and(
              _operators.eq(table.projectId, projectId),
              _operators.eq(table.name, name)
            )!
        }
      })
      .pipe(Effect.orDie)
    if (!existing) return yield* new NotFound()

    const nextName = patch.name ?? existing.name
    const nextColor = patch.color ?? existing.color
    const renaming = nextName !== existing.name

    if (renaming) {
      const collision = yield* db.query.projectTag
        .findFirst({
          columns: { name: true },
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.projectId, projectId),
                _operators.eq(table.name, nextName)
              )!
          }
        })
        .pipe(Effect.orDie)
      if (collision) return yield* new Conflict({ reason: "tag_exists" })
    }

    yield* db
      .update(projectTag)
      .set({ name: nextName, color: nextColor })
      .where(
        and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
      )
      .pipe(Effect.orDie)

    if (renaming) {
      yield* rewrites.renameTag(orgSlug, slug, name, nextName)
    }

    return {
      name: makeTagName(nextName),
      color: makeTagColor(nextColor),
      createdBy: existing.createdBy,
      createdAt: existing.createdAt
    }
  })

  const remove = Effect.fn("Tags.remove")(function* (name: string) {
    const { orgSlug, slug, projectId } = yield* ProjectScope

    const existingRow = yield* db.query.projectTag
      .findFirst({
        columns: { name: true },
        where: {
          RAW: (table, _operators) =>
            _operators.and(
              _operators.eq(table.projectId, projectId),
              _operators.eq(table.name, name)
            )!
        }
      })
      .pipe(Effect.orDie)
    if (!existingRow) return yield* new NotFound()

    yield* rewrites.renameTag(orgSlug, slug, name, null)
    yield* db
      .delete(projectTag)
      .where(
        and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
      )
      .pipe(Effect.orDie)
  })

  return Tags.of({ list, listPaged, create, update, remove })
})

export const layer = Layer.effect(Tags, make)
