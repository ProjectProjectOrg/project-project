import { Db } from "@pp/db"
import { projectTag } from "@pp/db/schema"
import {
  Conflict,
  NotFound,
  paginateSorted,
  Tag,
  TagColor,
  TagName,
  TAG_DEFAULT_PALETTE
} from "@pp/shared"
import { ProjectScope } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { MarkdownError } from "../markdown/Markdown"
import { TicketIndex } from "../tickets/TicketIndex"
import { Tickets } from "../tickets/Tickets"
import { Tags, type TagsShape } from "./Tags"

const makeTagName = Schema.decodeUnknownSync(TagName)
const makeTagColor = Schema.decodeUnknownSync(TagColor)

function pickColor(used: ReadonlyArray<string>): TagColor {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return makeTagColor(c)
  return makeTagColor(
    TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
  )
}

export const TagsLive = Layer.effect(
  Tags,
  Effect.gen(function* () {
    const db = yield* Db
    const ticketIndex = yield* TicketIndex
    const tickets = yield* Tickets

    const rewriteTagInTickets = (
      orgSlug: string,
      slug: string,
      oldName: string,
      newName: string | null
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        const project = yield* ticketIndex
          .projectFor(orgSlug, slug)
          .pipe(Effect.orDie)
        const ids = yield* ticketIndex.findTicketIdsByTag(project, oldName)
        for (const id of ids) {
          yield* tickets.replaceTag(orgSlug, slug, id, oldName, newName).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(false)),
            Effect.catchTag("MalformedTicketDocument", () =>
              Effect.succeed(false)
            )
          )
        }
      })

    const list: TagsShape["list"] = () =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const rows = yield* db.query.projectTag
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectId)
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

    const listPaged: TagsShape["listPaged"] = (cursor, limit) =>
      Effect.gen(function* () {
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

    const create: TagsShape["create"] = (input) =>
      Effect.gen(function* () {
        const { userId, projectId } = yield* ProjectScope

        const existing = yield* db.query.projectTag
          .findMany({
            columns: { color: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectId)
            }
          })
          .pipe(Effect.orDie)

        const color = input.color ?? pickColor(existing.map((e) => e.color))

        const existingRow = yield* db.query.projectTag
          .findFirst({
            columns: { name: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectId, projectId),
                  _operators.eq(table.name, input.name)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (existingRow) return yield* new Conflict({ reason: "tag_exists" })

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

    const update: TagsShape["update"] = (name, patch) =>
      Effect.gen(function* () {
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
          yield* rewriteTagInTickets(orgSlug, slug, name, nextName)
        }

        return {
          name: makeTagName(nextName),
          color: makeTagColor(nextColor),
          createdBy: existing.createdBy,
          createdAt: existing.createdAt
        }
      })

    const remove: TagsShape["remove"] = (name) =>
      Effect.gen(function* () {
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

        yield* rewriteTagInTickets(orgSlug, slug, name, null)
        yield* db
          .delete(projectTag)
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .pipe(Effect.orDie)
      })

    return { list, listPaged, create, update, remove } satisfies TagsShape
  })
)
