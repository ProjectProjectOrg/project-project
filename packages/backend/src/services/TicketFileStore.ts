import { Data, Effect } from "effect"
import { eq, sql } from "drizzle-orm"
import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import matter from "gray-matter"
import { NotFound, TicketChanged, TicketId } from "@projectproject/shared"
import { projectIndex, projectTicketCounter } from "../db/schema"
import { Db } from "./Db"
import { Markdown, MarkdownError, TicketIdTaken } from "./Markdown"

export class TicketStoreError extends Data.TaggedError("TicketStoreError")<{
  readonly cause: unknown
  readonly message: string
}> {}

const SAFE_TICKET_ID = /^T-[1-9][0-9]*$/

function versionOf(raw: string): string {
  return `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`
}

function ticketNumber(id: string): number {
  return Number(id.slice(2))
}

export interface StoredTicketFile {
  readonly data: Record<string, unknown>
  readonly body: string
  readonly raw: string
  readonly version: string
}

export class TicketFileStore extends Effect.Service<TicketFileStore>()(
  "TicketFileStore",
  {
    effect: Effect.gen(function* () {
      const db = yield* Db
      const md = yield* Markdown

      const ticketPath = (orgSlug: string, slug: string, id: string) =>
        path.join(md.projectDir(orgSlug, slug), "tickets", `${id}.md`)

      const ensureSafeId = (id: string): Effect.Effect<void, MarkdownError> =>
        SAFE_TICKET_ID.test(id)
          ? Effect.void
          : Effect.fail(
              new MarkdownError({
                cause: undefined,
                message: `unsafe ticket id: ${id}`
              })
            )

      const readRaw = (
        orgSlug: string,
        slug: string,
        id: string
      ): Effect.Effect<StoredTicketFile, NotFound | MarkdownError> =>
        Effect.gen(function* () {
          yield* ensureSafeId(id)
          const file = ticketPath(orgSlug, slug, id)
          const raw = yield* Effect.tryPromise({
            try: () => fs.readFile(file, "utf8"),
            catch: (cause): NotFound | MarkdownError => {
              const code = (cause as NodeJS.ErrnoException | undefined)?.code
              if (code === "ENOENT") return new NotFound()
              return new MarkdownError({
                cause,
                message: `read failed: ${file}`
              })
            }
          })
          const parsed = matter(raw)
          return {
            data: parsed.data as Record<string, unknown>,
            body: parsed.content,
            raw,
            version: versionOf(raw)
          }
        })

      const writeAtomic = (
        orgSlug: string,
        slug: string,
        id: string,
        frontmatter: Record<string, unknown>,
        body: string
      ): Effect.Effect<void, MarkdownError> =>
        Effect.gen(function* () {
          yield* ensureSafeId(id)
          const file = ticketPath(orgSlug, slug, id)
          const dir = path.dirname(file)
          const temp = path.join(
            dir,
            `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`
          )
          const content = matter.stringify(body, frontmatter)
          yield* Effect.tryPromise({
            try: async () => {
              await fs.mkdir(dir, { recursive: true })
              await fs.writeFile(temp, content, "utf8")
              await fs.rename(temp, file)
            },
            catch: (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          })
        })

      const failIfChanged = (
        file: StoredTicketFile,
        baseVersion: string,
        fields: ReadonlyArray<string>
      ): Effect.Effect<void, TicketChanged> =>
        file.version === baseVersion
          ? Effect.void
          : Effect.fail(
              new TicketChanged({
                currentVersion: file.version,
                conflictingFields: [...fields],
                message: "Ticket changed elsewhere. Refresh before saving."
              })
            )

      const withTicketLock = <A, E>(
        orgSlug: string,
        slug: string,
        id: string,
        effect: Effect.Effect<A, E>
      ): Effect.Effect<A, E | TicketStoreError> =>
        Effect.gen(function* () {
          const key = `${orgSlug}/${slug}/${id}`
          yield* db
            .execute(sql`select pg_advisory_lock(hashtext(${key}))`)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new TicketStoreError({
                    cause,
                    message: "ticket lock failed"
                  })
              )
            )
          return yield* effect.pipe(
            Effect.ensuring(
              db
                .execute(sql`select pg_advisory_unlock(hashtext(${key}))`)
                .pipe(Effect.ignore)
            )
          )
        })

      const withProjectLock = <A, E>(
        orgSlug: string,
        slug: string,
        effect: Effect.Effect<A, E>
      ): Effect.Effect<A, E | TicketStoreError> =>
        Effect.gen(function* () {
          const key = `${orgSlug}/${slug}`
          yield* db
            .execute(sql`select pg_advisory_lock(hashtext(${key}))`)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new TicketStoreError({
                    cause,
                    message: "project lock failed"
                  })
              )
            )
          return yield* effect.pipe(
            Effect.ensuring(
              db
                .execute(sql`select pg_advisory_unlock(hashtext(${key}))`)
                .pipe(Effect.ignore)
            )
          )
        })

      const projectIdFromSlug = (
        slug: string
      ): Effect.Effect<string, NotFound | TicketStoreError> =>
        db.query.projectIndex
          .findFirst({
            columns: { id: true },
            where: eq(projectIndex.slug, slug)
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new TicketStoreError({
                  cause,
                  message: "failed to read project id"
                })
            ),
            Effect.flatMap((row) =>
              row ? Effect.succeed(row.id) : Effect.fail(new NotFound())
            )
          )

      const allocateId = (
        orgSlug: string,
        slug: string
      ): Effect.Effect<TicketId, NotFound | MarkdownError | TicketStoreError> =>
        withProjectLock(
          orgSlug,
          slug,
          Effect.gen(function* () {
            const projectId = yield* projectIdFromSlug(slug)
            const existing = yield* db.query.projectTicketCounter
              .findFirst({
                where: eq(projectTicketCounter.projectId, projectId)
              })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new TicketStoreError({
                      cause,
                      message: "failed to read ticket counter"
                    })
                )
              )
            const nextNumber =
              existing?.nextNumber ??
              (yield* md.listTicketIds(orgSlug, slug)).reduce(
                (max, id) => Math.max(max, ticketNumber(id)),
                0
              ) + 1
            yield* db
              .insert(projectTicketCounter)
              .values({ projectId, nextNumber: nextNumber + 1 })
              .onConflictDoUpdate({
                target: projectTicketCounter.projectId,
                set: { nextNumber: nextNumber + 1, updatedAt: new Date() }
              })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new TicketStoreError({
                      cause,
                      message: "failed to update ticket counter"
                    })
                )
              )
            return `T-${nextNumber}` as TicketId
          })
        )

      const create = (
        orgSlug: string,
        slug: string,
        id: string,
        frontmatter: Record<string, unknown>,
        body: string
      ): Effect.Effect<void, MarkdownError | TicketIdTaken> =>
        md.createTicketFile(orgSlug, slug, id, frontmatter, body)

      const writeChecked = (
        orgSlug: string,
        slug: string,
        id: string,
        baseVersion: string,
        conflictingFields: ReadonlyArray<string>,
        mutate: (current: StoredTicketFile) => {
          frontmatter: Record<string, unknown>
          body: string
        }
      ): Effect.Effect<
        StoredTicketFile,
        NotFound | MarkdownError | TicketChanged | TicketStoreError
      > =>
        withTicketLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const current = yield* readRaw(orgSlug, slug, id)
            yield* failIfChanged(current, baseVersion, conflictingFields)
            const next = mutate(current)
            yield* writeAtomic(orgSlug, slug, id, next.frontmatter, next.body)
            return yield* readRaw(orgSlug, slug, id)
          })
        )

      const writeLatest = (
        orgSlug: string,
        slug: string,
        id: string,
        mutate: (current: StoredTicketFile) => {
          frontmatter: Record<string, unknown>
          body: string
        }
      ): Effect.Effect<
        StoredTicketFile,
        NotFound | MarkdownError | TicketStoreError
      > =>
        withTicketLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const current = yield* readRaw(orgSlug, slug, id)
            const next = mutate(current)
            yield* writeAtomic(orgSlug, slug, id, next.frontmatter, next.body)
            return yield* readRaw(orgSlug, slug, id)
          })
        )

      const removeChecked = (
        orgSlug: string,
        slug: string,
        id: string,
        baseVersion: string
      ): Effect.Effect<
        void,
        NotFound | MarkdownError | TicketChanged | TicketStoreError
      > =>
        withTicketLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const current = yield* readRaw(orgSlug, slug, id)
            yield* failIfChanged(current, baseVersion, ["delete"])
            yield* md.removeTicketFile(orgSlug, slug, id)
          })
        )

      return {
        readRaw,
        allocateId,
        create,
        writeChecked,
        writeLatest,
        removeChecked
      } as const
    })
  }
) {}
