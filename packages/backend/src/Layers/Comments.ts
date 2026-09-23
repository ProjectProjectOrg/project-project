import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import {
  Comment,
  CommentId,
  CreateCommentInput,
  Forbidden,
  NotFound,
  UpdateCommentInput,
  type MentionInvalid,
  type TicketId
} from "@projectproject/shared"
import { commentIndex } from "../db/schema"
import {
  type CommentBlock,
  parseCommentsRegion,
  serializeCommentsRegion,
  validateCommentBody
} from "../comments-region"
import { Db } from "../Services/Db"
import type { MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
import { TicketIndex } from "../Services/TicketIndex"
import {
  type MalformedTicketDocument,
  TicketDocs
} from "../Services/TicketDocs"
import { Users } from "../Services/Users"
import { validateBodyMentionsWithLookups } from "../Services/BodyMentions"
import {
  Comments,
  InvalidCommentAuthor,
  InvalidCommentBody,
  type CommentsShape,
  HistoricalCommentAuthor,
  type HistoricalCommentInput
} from "../Services/Comments"

const decodeCommentId = Schema.decodeUnknownSync(CommentId)
const newCommentId = (): CommentId => decodeCommentId(`c_${ulid()}`)

export const CommentsLive = Layer.effect(
  Comments,
  Effect.gen(function* () {
    const db = yield* Db
    const projects = yield* Projects
    const ticketIndex = yield* TicketIndex
    const ticketDocs = yield* TicketDocs
    const users = yield* Users

    const ensureMember = (orgSlug: string, userId: string, slug: string) =>
      projects.requireMember(orgSlug, userId, slug)

    const validateBody = (
      orgSlug: string,
      userId: string,
      slug: string,
      body: string
    ) =>
      validateBodyMentionsWithLookups(body, {
        existingTicketIds: (ticketIds) =>
          ticketIndex
            .projectFor(orgSlug, slug)
            .pipe(
              Effect.flatMap((project) =>
                ticketIndex.existingIds(project, ticketIds)
              )
            ),
        memberIds: () =>
          projects
            .get(orgSlug, userId, slug)
            .pipe(
              Effect.map(
                (project) =>
                  new Set<string>(project.members.map((member) => member.id))
              )
            )
      })

    const updateBlocks = (
      orgSlug: string,
      slug: string,
      ticketId: string,
      transform: (
        blocks: ReadonlyArray<CommentBlock>
      ) => ReadonlyArray<CommentBlock>,
      onPersist?: Effect.Effect<void, MarkdownError>
    ) => {
      let previous: Parameters<typeof ticketDocs.write>[3] | undefined
      return ticketDocs.update(
        orgSlug,
        slug,
        ticketId,
        (document) => {
          previous = document
          return Effect.succeed({
            ...document,
            commentsRegion: serializeCommentsRegion(
              transform(parseCommentsRegion(document.commentsRegion))
            )
          })
        },
        () =>
          onPersist
            ? onPersist.pipe(
                Effect.onError(() =>
                  previous
                    ? ticketDocs
                        .write(orgSlug, slug, ticketId, previous)
                        .pipe(Effect.orDie)
                    : Effect.void
                )
              )
            : Effect.void
      )
    }

    const list = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: TicketId
    ): Effect.Effect<
      ReadonlyArray<Comment>,
      NotFound | MarkdownError | MalformedTicketDocument
    > =>
      Effect.gen(function* () {
        yield* ensureMember(orgSlug, userId, slug)
        const rows = yield* db.query.commentIndex
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectSlug, slug),
                  _operators.eq(table.ticketId, ticketId)
                )!
            },
            orderBy: (c, { asc }) => [asc(c.createdAt)]
          })
          .pipe(Effect.orDie)
        if (rows.length === 0) return []
        const document = yield* ticketDocs.read(orgSlug, slug, ticketId)
        const blocks = parseCommentsRegion(document.commentsRegion)
        const blockById = new Map(blocks.map((b) => [b.id, b]))
        const authors = yield* users.fullByIds(
          rows.flatMap((r) => (r.authorId === null ? [] : [r.authorId]))
        )
        const authorById = new Map<string, (typeof authors)[number]>(
          authors.map((user) => [user.id, user])
        )
        return rows.flatMap((r): Comment[] => {
          const block = blockById.get(r.id)
          if (!block) return []
          const author =
            r.authorKind === "user"
              ? (() => {
                  const user = r.authorId
                    ? authorById.get(r.authorId)
                    : undefined
                  return user ? ({ kind: "user", user } as const) : null
                })()
              : r.jiraDisplayName && r.jiraAccountId
                ? ({
                    kind: "jira",
                    displayName: r.jiraDisplayName,
                    accountId: r.jiraAccountId
                  } as const)
                : null
          if (!author) return []
          if (r.origin === "native") {
            if (author.kind !== "user") return []
            return [
              {
                id: decodeCommentId(r.id),
                ticketId,
                projectSlug: slug,
                author,
                origin: "native",
                body: block.body,
                createdAt: r.createdAt,
                editedAt: r.editedAt ?? null
              }
            ]
          }
          return [
            {
              id: decodeCommentId(r.id),
              ticketId,
              projectSlug: slug,
              author,
              origin: "jira",
              body: block.body,
              createdAt: r.createdAt,
              editedAt: r.editedAt ?? null
            }
          ]
        })
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: TicketId,
      input: CreateCommentInput
    ): Effect.Effect<
      Comment,
      | NotFound
      | InvalidCommentBody
      | MentionInvalid
      | MarkdownError
      | MalformedTicketDocument
    > =>
      Effect.gen(function* () {
        yield* ensureMember(orgSlug, userId, slug)
        const validation = validateCommentBody(input.body)
        if (!validation.ok) {
          return yield* new InvalidCommentBody({ reason: validation.reason })
        }
        yield* validateBody(orgSlug, userId, slug, input.body)
        const id = newCommentId()
        const now = yield* DateTime.nowAsDate

        yield* db
          .insert(commentIndex)
          .values({
            id,
            projectSlug: slug,
            ticketId,
            authorId: userId,
            authorKind: "user",
            origin: "native",
            jiraDisplayName: null,
            jiraAccountId: null,
            createdAt: now,
            editedAt: null
          })
          .pipe(Effect.orDie)

        const next: CommentBlock = {
          id,
          author: { kind: "user", userId },
          origin: "native",
          createdAt: now,
          editedAt: null,
          body: input.body
        }
        yield* updateBlocks(orgSlug, slug, ticketId, (blocks) => [
          ...blocks,
          next
        ]).pipe(
          Effect.onError(() =>
            db
              .delete(commentIndex)
              .where(eq(commentIndex.id, id))
              .pipe(Effect.orDie)
          )
        )
        const author = yield* users
          .fullByIds([userId])
          .pipe(Effect.map((xs) => xs[0]))
        return {
          id,
          ticketId,
          projectSlug: slug,
          author: { kind: "user", user: author },
          origin: "native",
          body: input.body,
          createdAt: now,
          editedAt: null
        }
      })

    const importHistorical = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: TicketId,
      input: ReadonlyArray<HistoricalCommentInput>
    ) =>
      Effect.gen(function* () {
        yield* ensureMember(orgSlug, userId, slug)
        yield* Effect.forEach(input, (comment) =>
          Effect.gen(function* () {
            if (!Schema.is(HistoricalCommentAuthor)(comment.author)) {
              return yield* new InvalidCommentAuthor({
                reason: "invalid_attribution"
              })
            }
            const validation = validateCommentBody(comment.body)
            if (!validation.ok) {
              return yield* new InvalidCommentBody({
                reason: validation.reason
              })
            }
            yield* validateBody(orgSlug, userId, slug, comment.body)
          })
        )

        const linkedUserIds = [
          ...new Set(
            input.flatMap((comment) =>
              comment.author.kind === "user" ? [comment.author.userId] : []
            )
          )
        ]
        const linkedUsers = yield* users.fullByIds(linkedUserIds)
        const linkedUserById = new Map<string, (typeof linkedUsers)[number]>(
          linkedUsers.map((user) => [user.id, user])
        )
        for (const linkedUserId of linkedUserIds) {
          if (!linkedUserById.has(linkedUserId)) {
            return yield* new InvalidCommentAuthor({
              reason: `unknown_user:${linkedUserId}`
            })
          }
        }

        const blocks = input.map((comment): CommentBlock => ({
          id: newCommentId(),
          author: comment.author,
          origin: "jira",
          body: comment.body,
          createdAt: comment.createdAt,
          editedAt: comment.editedAt
        }))
        if (blocks.length === 0) return []
        const ids = blocks.map((block) => block.id)
        yield* db
          .insert(commentIndex)
          .values(
            blocks.map((block) => ({
              id: block.id,
              projectSlug: slug,
              ticketId,
              origin: "jira" as const,
              authorKind: block.author.kind,
              authorId:
                block.author.kind === "user" ? block.author.userId : null,
              jiraDisplayName:
                block.author.kind === "jira" ? block.author.displayName : null,
              jiraAccountId:
                block.author.kind === "jira" ? block.author.accountId : null,
              createdAt: block.createdAt,
              editedAt: block.editedAt
            }))
          )
          .pipe(Effect.orDie)
        yield* updateBlocks(orgSlug, slug, ticketId, (current) => [
          ...current,
          ...blocks
        ]).pipe(
          Effect.onError(() =>
            db
              .delete(commentIndex)
              .where(inArray(commentIndex.id, ids))
              .pipe(Effect.orDie)
          )
        )

        return blocks.map((block) => ({
          id: decodeCommentId(block.id),
          ticketId,
          projectSlug: slug,
          author:
            block.author.kind === "user"
              ? {
                  kind: "user" as const,
                  user: linkedUserById.get(block.author.userId)!
                }
              : block.author,
          origin: "jira" as const,
          body: block.body,
          createdAt: block.createdAt,
          editedAt: block.editedAt
        }))
      })

    const requireAuthor = (
      slug: string,
      ticketId: string,
      commentId: string,
      userId: string
    ): Effect.Effect<
      { authorId: string; createdAt: Date },
      NotFound | Forbidden
    > =>
      Effect.gen(function* () {
        const row = yield* db.query.commentIndex
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.id, commentId),
                  _operators.eq(table.projectSlug, slug),
                  _operators.eq(table.ticketId, ticketId)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (!row) return yield* new NotFound()
        if (row.origin === "jira" || row.authorId !== userId) {
          return yield* new Forbidden()
        }
        return { authorId: row.authorId, createdAt: row.createdAt }
      })

    const edit = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: TicketId,
      commentId: CommentId,
      input: UpdateCommentInput
    ): Effect.Effect<
      Comment,
      | NotFound
      | Forbidden
      | InvalidCommentBody
      | MentionInvalid
      | MarkdownError
      | MalformedTicketDocument
    > =>
      Effect.gen(function* () {
        yield* ensureMember(orgSlug, userId, slug)
        const validation = validateCommentBody(input.body)
        if (!validation.ok) {
          return yield* new InvalidCommentBody({ reason: validation.reason })
        }
        const meta = yield* requireAuthor(slug, ticketId, commentId, userId)
        yield* validateBody(orgSlug, userId, slug, input.body)
        const editedAt = yield* DateTime.nowAsDate
        yield* updateBlocks(
          orgSlug,
          slug,
          ticketId,
          (blocks) =>
            blocks.map((block) =>
              block.id === commentId
                ? { ...block, body: input.body, editedAt }
                : block
            ),
          db
            .update(commentIndex)
            .set({ editedAt })
            .where(eq(commentIndex.id, commentId))
            .pipe(Effect.asVoid, Effect.orDie)
        )
        const author = yield* users
          .fullByIds([userId])
          .pipe(Effect.map((xs) => xs[0]))
        return {
          id: commentId,
          ticketId,
          projectSlug: slug,
          author: { kind: "user", user: author },
          origin: "native",
          body: input.body,
          createdAt: meta.createdAt,
          editedAt
        }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: TicketId,
      commentId: CommentId
    ): Effect.Effect<
      void,
      NotFound | Forbidden | MarkdownError | MalformedTicketDocument
    > =>
      Effect.gen(function* () {
        yield* ensureMember(orgSlug, userId, slug)
        yield* requireAuthor(slug, ticketId, commentId, userId)
        yield* updateBlocks(
          orgSlug,
          slug,
          ticketId,
          (blocks) => blocks.filter((block) => block.id !== commentId),
          db
            .delete(commentIndex)
            .where(eq(commentIndex.id, commentId))
            .pipe(Effect.asVoid, Effect.orDie)
        )
      })

    return {
      list,
      create,
      importHistorical,
      edit,
      remove
    } satisfies CommentsShape
  })
)
