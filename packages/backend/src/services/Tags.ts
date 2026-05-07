import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import {
  Conflict,
  Forbidden,
  NotFound,
  Tag,
  TAG_DEFAULT_PALETTE,
  type CreateTagInput,
  type UpdateTagInput
} from "@projectproject/shared"
import { projectIndex, projectTag } from "../db/schema"
import { Db } from "./Db"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"
import { Tickets } from "./Tickets"

function pickColor(used: ReadonlyArray<string>): string {
  for (const c of TAG_DEFAULT_PALETTE) if (!used.includes(c)) return c
  return TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
}

export class Tags extends Effect.Service<Tags>()("Tags", {
  effect: Effect.gen(function* () {
    const db = yield* Db
    const md = yield* Markdown
    const projects = yield* Projects
    const tickets = yield* Tickets

    const projectIdFromSlug = (slug: string): Effect.Effect<string, NotFound> =>
      db.query.projectIndex
        .findFirst({
          columns: { id: true },
          where: eq(projectIndex.slug, slug)
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row ? Effect.succeed(row.id) : Effect.fail(new NotFound())
          )
        )

    const rewriteTagInTickets = (
      orgSlug: string,
      slug: string,
      oldName: string,
      newName: string | null
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        const ids = yield* md.listTicketIds(orgSlug, slug)
        for (const id of ids) {
          yield* tickets
            .replaceTag(orgSlug, slug, id, oldName, newName)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(false)))
        }
      })

    const list = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Tag>, NotFound> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const projectId = yield* projectIdFromSlug(slug)
        const rows = yield* db.query.projectTag
          .findMany({ where: eq(projectTag.projectId, projectId) })
          .pipe(Effect.orDie)
        return rows.map(
          (r): Tag => ({
            name: r.name as Tag["name"],
            color: r.color as Tag["color"],
            createdBy: r.createdBy,
            createdAt: r.createdAt
          })
        )
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: CreateTagInput
    ): Effect.Effect<Tag, NotFound | Forbidden | Conflict> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existing = yield* db.query.projectTag
          .findMany({
            columns: { color: true },
            where: eq(projectTag.projectId, projectId)
          })
          .pipe(Effect.orDie)

        const color =
          input.color ??
          (pickColor(existing.map((e) => e.color)) as Tag["color"])

        const existingRow = yield* db.query.projectTag
          .findFirst({
            columns: { name: true },
            where: and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, input.name)
            )
          })
          .pipe(Effect.orDie)
        if (existingRow)
          return yield* Effect.fail(new Conflict({ reason: "tag_exists" }))

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
          name: row.name as Tag["name"],
          color: row.color as Tag["color"],
          createdBy: row.createdBy,
          createdAt: row.createdAt
        }
      })

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      name: string,
      patch: UpdateTagInput
    ): Effect.Effect<Tag, NotFound | Forbidden | Conflict | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existing = yield* db.query.projectTag
          .findFirst({
            where: and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
          })
          .pipe(Effect.orDie)
        if (!existing) return yield* Effect.fail(new NotFound())

        const nextName = patch.name ?? existing.name
        const nextColor = patch.color ?? existing.color
        const renaming = nextName !== existing.name

        if (renaming) {
          const collision = yield* db.query.projectTag
            .findFirst({
              columns: { name: true },
              where: and(
                eq(projectTag.projectId, projectId),
                eq(projectTag.name, nextName)
              )
            })
            .pipe(Effect.orDie)
          if (collision)
            return yield* Effect.fail(new Conflict({ reason: "tag_exists" }))
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
          name: nextName as Tag["name"],
          color: nextColor as Tag["color"],
          createdBy: existing.createdBy,
          createdAt: existing.createdAt
        }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      name: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existingRow = yield* db.query.projectTag
          .findFirst({
            columns: { name: true },
            where: and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
          })
          .pipe(Effect.orDie)
        if (!existingRow) return yield* Effect.fail(new NotFound())

        yield* rewriteTagInTickets(orgSlug, slug, name, null)
        yield* db
          .delete(projectTag)
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .pipe(Effect.orDie)
      })

    return { list, create, update, remove } as const
  })
}) {}
