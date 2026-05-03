// Projects service — domain logic combining the DB index and the markdown
// store. Handlers in `handlers/projects.ts` call into this; nothing else does.
//
// list:    DB query, filtered by ownerId. We don't read the markdown file for
//          list responses — the row in `project_index` carries everything we
//          show in the list (slug, name, createdAt). Reading the file would be
//          O(n) IO for what is purely an index-shaped read.
//
// create:  Derive a slug from the name → loop to find an unused suffix →
//          insert the DB row → write the markdown file. If the FS write fails
//          after the DB insert, we delete the row and re-fail. We do DB-first
//          because the unique constraint on slug gives us atomic conflict
//          detection without a separate "does this folder exist" check.

import { Effect } from "effect"
import { and, asc, eq } from "drizzle-orm"
import { NotFound } from "@projectproject/shared"
import type {
  CreateProjectInput,
  Project,
  ProjectDetail,
  UpdateProjectInput
} from "@projectproject/shared"
import { projectIndex } from "../db/schema"
import { Db } from "./Db"
import { Markdown, type MarkdownError } from "./Markdown"

const MAX_SLUG_ATTEMPTS = 100

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export class Projects extends Effect.Service<Projects>()(
  "Projects",
  {
    effect: Effect.gen(function*() {
      const db = yield* Db
      const md = yield* Markdown

      const list = (ownerId: string): Effect.Effect<ReadonlyArray<Project>> =>
        db
          .select()
          .from(projectIndex)
          .where(eq(projectIndex.ownerId, ownerId))
          .orderBy(asc(projectIndex.createdAt))
          .pipe(Effect.orDie)

      const findFreeSlug = (
        base: string
      ): Effect.Effect<string> =>
        Effect.gen(function*() {
          // Empty base (e.g. "!!!" → "") falls back to "project".
          const safeBase = base.length > 0 ? base : "project"
          for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
            const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`
            const existing = yield* db
              .select({ slug: projectIndex.slug })
              .from(projectIndex)
              .where(eq(projectIndex.slug, candidate))
              .limit(1)
              .pipe(Effect.orDie)
            if (existing.length === 0) return candidate
          }
          return yield* Effect.die(
            new Error(`could not allocate unique slug for "${base}"`)
          )
        })

      const create = (
        ownerId: string,
        input: CreateProjectInput
      ): Effect.Effect<Project> =>
        Effect.gen(function*() {
          const slug = yield* findFreeSlug(slugify(input.name))
          const createdAt = new Date()

          const [row] = yield* db
            .insert(projectIndex)
            .values({
              slug,
              name: input.name,
              ownerId,
              createdAt
            })
            .returning()
            .pipe(Effect.orDie)

          // Write the markdown after the DB row exists, so the slug is locked
          // in. If the write fails, roll the row back so we don't leave an
          // orphan index entry pointing at no file.
          yield* md
            .writeProjectFile(
              slug,
              {
                name: input.name,
                slug,
                ownerId,
                createdAt: createdAt.toISOString()
              },
              `# ${input.name}\n`
            )
            .pipe(
              Effect.catchAll((cause) =>
                db
                  .delete(projectIndex)
                  .where(eq(projectIndex.slug, slug))
                  .pipe(Effect.orDie, Effect.zipRight(Effect.die(cause)))
              )
            )

          return {
            slug: row.slug,
            name: row.name,
            ownerId: row.ownerId,
            createdAt: row.createdAt
          }
        })

      const getBySlug = (
        ownerId: string,
        slug: string
      ): Effect.Effect<Project | null> =>
        db
          .select()
          .from(projectIndex)
          .where(
            and(eq(projectIndex.slug, slug), eq(projectIndex.ownerId, ownerId))
          )
          .limit(1)
          .pipe(
            Effect.map((rows) => rows[0] ?? null),
            Effect.orDie
          )

      // Detail = index row + markdown body. NotFound covers two cases the
      // client doesn't need to distinguish: the slug isn't owned by this user,
      // and the markdown file is missing on disk. Either way the user can't
      // see it. The MarkdownError defect path stays a defect — that's a
      // corruption signal, not a routine outcome.
      const get = (
        ownerId: string,
        slug: string
      ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          const row = yield* getBySlug(ownerId, slug)
          if (row === null) return yield* Effect.fail(new NotFound())
          const file = yield* md.readProjectFile(slug)
          return {
            slug: row.slug,
            name: row.name,
            ownerId: row.ownerId,
            createdAt: row.createdAt,
            body: file.body
          }
        })

      const update = (
        ownerId: string,
        slug: string,
        input: UpdateProjectInput
      ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          const existing = yield* getBySlug(ownerId, slug)
          if (existing === null) return yield* Effect.fail(new NotFound())

          // Read the markdown so we can preserve the body if only `name` changed
          // (and vice versa). Read can fail with NotFound if disk is out of sync
          // with DB; that's a corruption case — surface it the same as a missing
          // project to the client.
          const file = yield* md.readProjectFile(slug)

          const nextName = input.name ?? existing.name
          const nextBody = input.body ?? file.body

          // Update DB row first if name changed; the markdown frontmatter is the
          // mirror, not the truth.
          if (input.name !== undefined && input.name !== existing.name) {
            yield* db
              .update(projectIndex)
              .set({ name: nextName })
              .where(eq(projectIndex.slug, slug))
              .pipe(Effect.orDie)
          }

          yield* md.writeProjectFile(
            slug,
            {
              name: nextName,
              slug,
              ownerId,
              createdAt: existing.createdAt.toISOString()
            },
            nextBody
          )

          return {
            slug,
            name: nextName,
            ownerId,
            createdAt: existing.createdAt,
            body: nextBody
          }
        })

      const remove = (
        ownerId: string,
        slug: string
      ): Effect.Effect<void, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          const existing = yield* getBySlug(ownerId, slug)
          if (existing === null) return yield* Effect.fail(new NotFound())

          // FS first: if the directory is gone but the row remains, list/get are
          // already broken — but cleaning the row last lets the user retry the
          // delete to fix a partial state. If FS removal fails, we leave both in
          // place and surface the error.
          yield* md.removeProjectDir(slug)
          yield* db
            .delete(projectIndex)
            .where(eq(projectIndex.slug, slug))
            .pipe(Effect.orDie)
        })

      return { list, create, get, getBySlug, update, remove } as const
    })
  }
) {}
