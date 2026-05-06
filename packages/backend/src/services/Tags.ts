import { Effect, Schema } from "effect"
import { and, eq } from "drizzle-orm"
import {
  Conflict,
  Forbidden,
  NotFound,
  Tag,
  TagInUse,
  TicketId,
  type CreateTagInput,
  type UpdateTagInput
} from "@projectproject/shared"
import { projectIndex, projectTag } from "../db/schema"
import { Db } from "./Db"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"
import { Tickets } from "./Tickets"

const PALETTE = [
  "#7c3aed",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#f97316"
] as const

const TagFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  tags: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  })
})
const decodeTagFrontmatter = Schema.decodeUnknown(TagFrontmatter)

function pickColor(used: ReadonlyArray<string>): string {
  for (const c of PALETTE) if (!used.includes(c)) return c
  return PALETTE[used.length % PALETTE.length]
}

export class Tags extends Effect.Service<Tags>()("Tags", {
  effect: Effect.gen(function* () {
    const db = yield* Db
    const md = yield* Markdown
    const projects = yield* Projects
    const tickets = yield* Tickets

    const projectIdFromSlug = (
      slug: string
    ): Effect.Effect<string, NotFound> =>
      db
        .select({ id: projectIndex.id })
        .from(projectIndex)
        .where(eq(projectIndex.slug, slug))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(rows[0].id) : Effect.fail(new NotFound())
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

    const scanTagUsages = (
      orgSlug: string,
      slug: string,
      name: string
    ): Effect.Effect<
      ReadonlyArray<{ ticketId: TicketId; title: string }>,
      MarkdownError
    > =>
      Effect.gen(function* () {
        const ids = yield* md.listTicketIds(orgSlug, slug)
        const usages: { ticketId: TicketId; title: string }[] = []
        for (const id of ids) {
          const file = yield* md
            .readTicketFile(orgSlug, slug, id)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))
          if (!file) continue
          const decoded = yield* decodeTagFrontmatter(file.data).pipe(
            Effect.orDie
          )
          if (decoded.tags.includes(name)) {
            usages.push({ ticketId: decoded.id, title: decoded.title })
          }
        }
        return usages
      })

    const list = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Tag>, NotFound | Forbidden> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const projectId = yield* projectIdFromSlug(slug)
        const rows = yield* db
          .select()
          .from(projectTag)
          .where(eq(projectTag.projectId, projectId))
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

        const existing = yield* db
          .select({ color: projectTag.color })
          .from(projectTag)
          .where(eq(projectTag.projectId, projectId))
          .pipe(Effect.orDie)

        const color =
          input.color ??
          (pickColor(existing.map((e) => e.color)) as Tag["color"])

        const existingRow = yield* db
          .select({ name: projectTag.name })
          .from(projectTag)
          .where(
            and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, input.name)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existingRow.length > 0)
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
    ): Effect.Effect<
      Tag,
      NotFound | Forbidden | Conflict | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existingRows = yield* db
          .select()
          .from(projectTag)
          .where(
            and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existingRows.length === 0)
          return yield* Effect.fail(new NotFound())
        const existing = existingRows[0]

        const nextName = patch.name ?? existing.name
        const nextColor = patch.color ?? existing.color
        const renaming = nextName !== existing.name

        if (renaming) {
          const collision = yield* db
            .select({ name: projectTag.name })
            .from(projectTag)
            .where(
              and(
                eq(projectTag.projectId, projectId),
                eq(projectTag.name, nextName)
              )
            )
            .limit(1)
            .pipe(Effect.orDie)
          if (collision.length > 0)
            return yield* Effect.fail(new Conflict({ reason: "tag_exists" }))
        }

        yield* db
          .update(projectTag)
          .set({ name: nextName, color: nextColor })
          .where(
            and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
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
      name: string,
      force: boolean
    ): Effect.Effect<void, NotFound | Forbidden | TagInUse | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existingRows = yield* db
          .select({ name: projectTag.name })
          .from(projectTag)
          .where(
            and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existingRows.length === 0)
          return yield* Effect.fail(new NotFound())

        const usages = yield* scanTagUsages(orgSlug, slug, name)
        if (usages.length > 0 && !force) {
          return yield* Effect.fail(new TagInUse({ tagName: name, usages }))
        }

        if (usages.length > 0) {
          yield* rewriteTagInTickets(orgSlug, slug, name, null)
        }
        yield* db
          .delete(projectTag)
          .where(
            and(
              eq(projectTag.projectId, projectId),
              eq(projectTag.name, name)
            )
          )
          .pipe(Effect.orDie)
      })

    return { list, create, update, remove } as const
  })
}) {}
