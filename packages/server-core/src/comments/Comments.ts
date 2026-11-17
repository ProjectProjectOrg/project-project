import { CommentPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import { commentIndex } from "@pp/db/schema"
import {
  type ActivityActor,
  extractMentionLinks,
  formatMentionHref,
  parseTicketMentionId,
  Slug,
  Comment,
  Conflict,
  CommentId,
  type CreateCommentInput,
  Forbidden,
  ImportedAuthor,
  type MentionInvalid,
  NotFound,
  ProjectScope,
  TicketId,
  type UpdateCommentInput,
  type User
} from "@pp/shared"
import { eq, inArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import * as ProjectMembers from "../projects/ProjectMembers"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"
import * as Users from "../users/Users"
import { validateBodyMentionsWithLookups } from "./BodyMentions"
import {
  type CommentBlock,
  parseCommentsRegion,
  serializeCommentsRegion,
  validateCommentBody
} from "./comments-region"

export class InvalidCommentBody extends Data.TaggedError("InvalidCommentBody")<{
  readonly reason: string
}> {}

export class InvalidCommentAuthor extends Data.TaggedError(
  "InvalidCommentAuthor"
)<{
  readonly reason: string
}> {}

export const HistoricalCommentAuthor = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    userId: Schema.NonEmptyString
  }),
  ImportedAuthor
])
export type HistoricalCommentAuthor = typeof HistoricalCommentAuthor.Type

export type HistoricalCommentInput = Readonly<{
  author: HistoricalCommentAuthor
  body: string
  createdAt: Date
  editedAt: Date | null
}>

export class Comments extends Context.Service<
  Comments,
  Readonly<{
    list: (
      ticketId: TicketId
    ) => Effect.Effect<
      ReadonlyArray<Comment>,
      NotFound | Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
      ProjectScope
    >
    create: (
      ticketId: TicketId,
      input: CreateCommentInput
    ) => Effect.Effect<
      Comment,
      | Conflict
      | NotFound
      | InvalidCommentBody
      | MentionInvalid
      | Markdown.MarkdownError
      | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
    importHistorical: (
      ticketId: TicketId,
      input: ReadonlyArray<HistoricalCommentInput>
    ) => Effect.Effect<
      ReadonlyArray<Comment>,
      | NotFound
      | InvalidCommentBody
      | InvalidCommentAuthor
      | MentionInvalid
      | Markdown.MarkdownError
      | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
    edit: (
      ticketId: TicketId,
      commentId: CommentId,
      input: UpdateCommentInput
    ) => Effect.Effect<
      Comment,
      | Forbidden
      | NotFound
      | InvalidCommentBody
      | MentionInvalid
      | Markdown.MarkdownError
      | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
    resolve: (
      ticketId: TicketId,
      commentId: CommentId,
      resolved: boolean
    ) => Effect.Effect<
      Comment,
      NotFound | Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
    recordTicket: (
      ticketId: TicketId,
      commentId: CommentId,
      created: TicketId
    ) => Effect.Effect<
      void,
      NotFound | Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
    remove: (
      ticketId: TicketId,
      commentId: CommentId
    ) => Effect.Effect<
      void,
      | Forbidden
      | NotFound
      | Markdown.MarkdownError
      | TicketDocs.MalformedTicketDocument,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/comments/Comments") {}

const isHistoricalCommentAuthor = Schema.is(HistoricalCommentAuthor)

const decodeCommentId = Schema.decodeUnknownSync(CommentId)
const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeSlug = Schema.decodeUnknownSync(Slug)
const isTicketId = Schema.is(TicketId)
const isSlug = Schema.is(Slug)

const replyTo = (block: CommentBlock): CommentId | null =>
  block.replyTo === undefined ? null : decodeCommentId(block.replyTo)

const resolutionOf = (
  block: CommentBlock,
  userById: ReadonlyMap<string, User>
): Comment["resolution"] =>
  block.resolvedBy === undefined || block.resolvedAt === undefined
    ? null
    : { by: userById.get(block.resolvedBy) ?? null, at: block.resolvedAt }

const ticketsOf = (block: CommentBlock): Comment["tickets"] =>
  (block.tickets ?? []).flatMap((link) =>
    extractMentionLinks(link).flatMap(({ parsed }) => {
      if (parsed?.type !== "ticket") return []
      const target = parseTicketMentionId(parsed.id)
      if (!isTicketId(target.ticketId)) return []
      if (target.projectSlug !== null && !isSlug(target.projectSlug)) return []
      return [
        {
          projectSlug:
            target.projectSlug === null ? null : decodeSlug(target.projectSlug),
          id: decodeTicketId(target.ticketId)
        }
      ]
    })
  )

const withoutResolution = ({
  resolvedBy: _by,
  resolvedAt: _at,
  ...block
}: CommentBlock): CommentBlock => block

const make = Effect.gen(function* () {
  const db = yield* Db
  const projectMembers = yield* ProjectMembers.ProjectMembers
  const ticketIndex = yield* TicketIndex.TicketIndex
  const ticketDocs = yield* TicketDocs.TicketDocs
  const users = yield* Users.Users
  const crypto = yield* Crypto.Crypto

  const newCommentId: Effect.Effect<CommentId> = crypto.randomULID.pipe(
    Effect.orDie,
    Effect.map((id) => decodeCommentId(`c_${id}`))
  )

  const validateBody = (project: TicketProject, body: string) =>
    validateBodyMentionsWithLookups(body, {
      existingTicketIds: (ticketIds) =>
        ticketIndex.mentionableIds(project, ticketIds),
      memberIds: () => projectMembers.memberIds()
    })

  const updateBlocks = (
    orgSlug: string,
    slug: string,
    ticketId: string,
    transform: (
      blocks: ReadonlyArray<CommentBlock>
    ) => ReadonlyArray<CommentBlock>,
    onPersist?: Effect.Effect<void, Markdown.MarkdownError>
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

  const threadOf = (
    orgSlug: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId
  ) =>
    Effect.gen(function* () {
      const document = yield* ticketDocs.read(orgSlug, slug, ticketId)
      const blocks = parseCommentsRegion(document.commentsRegion)
      const target = blocks.find((block) => block.id === commentId)
      if (target === undefined) return yield* new NotFound()
      return blocks.find((block) => block.id === target.replyTo) ?? target
    })

  const list: Comments["Service"]["list"] = Effect.fn("Comments.list")(
    function* (ticketId) {
      const { orgSlug, slug, projectId } = yield* ProjectScope
      const rows = yield* db.query.commentIndex
        .findMany({
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.projectId, projectId),
                _operators.eq(table.ticketId, ticketId)
              )!
          },
          orderBy: (c, { asc }) => [asc(c.createdAt)]
        })
        .pipe(Effect.orDie)
      const document = yield* ticketDocs.read(orgSlug, slug, ticketId)
      const blocks = parseCommentsRegion(document.commentsRegion)
      const blockById = new Map(blocks.map((b) => [b.id, b]))
      const authors = yield* users.fullByIds([
        ...rows.flatMap((r) => (r.authorId === null ? [] : [r.authorId])),
        ...blocks.flatMap((b) =>
          b.resolvedBy === undefined ? [] : [b.resolvedBy]
        )
      ])
      const authorById = new Map<string, User>(
        authors.map((user) => [user.id, user])
      )
      return rows.flatMap((r): Comment[] => {
        const block = blockById.get(r.id)
        if (!block) return []
        const author =
          r.authorKind === "user"
            ? (() => {
                const user = r.authorId ? authorById.get(r.authorId) : undefined
                return user ? ({ kind: "user", user } as const) : null
              })()
            : r.importedName && r.importedSource && r.importedId
              ? ({
                  kind: "imported",
                  displayName: r.importedName,
                  source: r.importedSource,
                  sourceId: r.importedId
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
              editedAt: r.editedAt ?? null,
              replyTo: replyTo(block),
              resolution: resolutionOf(block, authorById),
              tickets: ticketsOf(block)
            }
          ]
        }
        return [
          {
            id: decodeCommentId(r.id),
            ticketId,
            projectSlug: slug,
            author,
            origin: r.origin,
            body: block.body,
            createdAt: r.createdAt,
            editedAt: r.editedAt ?? null,
            replyTo: replyTo(block),
            resolution: resolutionOf(block, authorById),
            tickets: ticketsOf(block)
          }
        ]
      })
    }
  )

  const create: Comments["Service"]["create"] = Effect.fn("Comments.create")(
    function* (ticketId, input) {
      const scope = yield* ProjectScope
      const { orgSlug, slug, userId, projectId } = scope
      const validation = validateCommentBody(input.body)
      if (!validation.ok) {
        return yield* new InvalidCommentBody({ reason: validation.reason })
      }
      const [, author] = yield* Effect.all(
        [
          validateBody(scope, input.body),
          users.fullByIds([userId]).pipe(Effect.map((xs) => xs[0]))
        ],
        { concurrency: 2 }
      )
      const root =
        input.replyTo === undefined
          ? null
          : yield* threadOf(orgSlug, slug, ticketId, input.replyTo)
      if (root?.resolvedBy !== undefined) {
        return yield* new Conflict({ reason: "thread_resolved" })
      }
      const thread = root === null ? null : decodeCommentId(root.id)
      const id = yield* newCommentId
      const now = yield* DateTime.nowAsDate

      yield* db
        .insert(commentIndex)
        .values({
          id,
          projectId,
          ticketId,
          authorId: userId,
          authorKind: "user",
          origin: "native",
          importedName: null,
          importedSource: null,
          importedId: null,
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
        ...(thread === null ? {} : { replyTo: thread }),
        body: input.body
      }
      let resolvedMeanwhile = false
      yield* updateBlocks(orgSlug, slug, ticketId, (blocks) => {
        resolvedMeanwhile = blocks.some(
          (block) => block.id === thread && block.resolvedBy !== undefined
        )
        return resolvedMeanwhile ? blocks : [...blocks, next]
      }).pipe(
        Effect.onError(() =>
          db
            .delete(commentIndex)
            .where(eq(commentIndex.id, id))
            .pipe(Effect.orDie)
        )
      )
      if (resolvedMeanwhile) {
        yield* db
          .delete(commentIndex)
          .where(eq(commentIndex.id, id))
          .pipe(Effect.orDie)
        return yield* new Conflict({ reason: "thread_resolved" })
      }
      return {
        id,
        ticketId,
        projectSlug: slug,
        author: { kind: "user", user: author },
        origin: "native",
        body: input.body,
        createdAt: now,
        editedAt: null,
        replyTo: thread,
        resolution: null,
        tickets: []
      }
    }
  )

  const importHistorical: Comments["Service"]["importHistorical"] = Effect.fn(
    "Comments.importHistorical"
  )(function* (ticketId, input) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, projectId } = scope
    yield* Effect.forEach(
      input,
      (comment) =>
        Effect.gen(function* () {
          if (!isHistoricalCommentAuthor(comment.author)) {
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
          yield* validateBody(scope, comment.body)
        }),
      { concurrency: 8, discard: true }
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

    const blocks = yield* Effect.forEach(input, (comment) =>
      Effect.map(
        newCommentId,
        (id): CommentBlock => ({
          id,
          author: comment.author,
          origin: "jira",
          body: comment.body,
          createdAt: comment.createdAt,
          editedAt: comment.editedAt
        })
      )
    )
    if (blocks.length === 0) return []
    const ids = blocks.map((block) => block.id)
    yield* db
      .insert(commentIndex)
      .values(
        blocks.map((block) => ({
          id: block.id,
          projectId,
          ticketId,
          origin: "jira" as const,
          authorKind: block.author.kind,
          authorId: block.author.kind === "user" ? block.author.userId : null,
          importedName:
            block.author.kind === "imported" ? block.author.displayName : null,
          importedSource:
            block.author.kind === "imported" ? block.author.source : null,
          importedId:
            block.author.kind === "imported" ? block.author.sourceId : null,
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
      editedAt: block.editedAt,
      replyTo: null,
      resolution: null,
      tickets: []
    }))
  })

  const authorizedComment = (
    ticketId: string,
    commentId: string,
    allowed: (
      actor: ProjectScope["Service"],
      comment: CommentPolicy.Authored
    ) => boolean
  ): Effect.Effect<
    { authorId: string; createdAt: Date },
    NotFound | Forbidden,
    ProjectScope
  > =>
    Effect.gen(function* () {
      const scope = yield* ProjectScope
      const row = yield* db.query.commentIndex
        .findFirst({
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.id, commentId),
                _operators.eq(table.projectId, scope.projectId),
                _operators.eq(table.ticketId, ticketId)
              )!
          }
        })
        .pipe(Effect.orDie)
      if (!row) return yield* new NotFound()
      const authorId = row.authorId
      if (
        row.origin !== "native" ||
        authorId === null ||
        !allowed(scope, { authorId })
      ) {
        return yield* new Forbidden()
      }
      return { authorId, createdAt: row.createdAt }
    })

  const edit: Comments["Service"]["edit"] = Effect.fn("Comments.edit")(
    function* (ticketId, commentId, input) {
      const scope = yield* ProjectScope
      const { orgSlug, slug } = scope
      const validation = validateCommentBody(input.body)
      if (!validation.ok) {
        return yield* new InvalidCommentBody({ reason: validation.reason })
      }
      const meta = yield* authorizedComment(
        ticketId,
        commentId,
        CommentPolicy.canEdit
      )
      yield* validateBody(scope, input.body)
      const editedAt = yield* DateTime.nowAsDate
      let edited: CommentBlock | undefined
      yield* updateBlocks(
        orgSlug,
        slug,
        ticketId,
        (blocks) =>
          blocks.map((block) => {
            if (block.id !== commentId) return block
            edited = { ...block, body: input.body, editedAt }
            return edited
          }),
        db
          .update(commentIndex)
          .set({ editedAt })
          .where(eq(commentIndex.id, commentId))
          .pipe(Effect.asVoid, Effect.orDie)
      )
      const people = yield* users.fullByIds([
        meta.authorId,
        ...(edited?.resolvedBy === undefined ? [] : [edited.resolvedBy])
      ])
      const peopleById = new Map<string, User>(
        people.map((user) => [user.id, user])
      )
      const author = peopleById.get(meta.authorId)!
      return {
        id: commentId,
        ticketId,
        projectSlug: slug,
        author: { kind: "user", user: author },
        origin: "native",
        body: input.body,
        createdAt: meta.createdAt,
        editedAt,
        replyTo: edited === undefined ? null : replyTo(edited),
        resolution:
          edited === undefined ? null : resolutionOf(edited, peopleById),
        tickets: edited === undefined ? [] : ticketsOf(edited)
      }
    }
  )

  const resolve: Comments["Service"]["resolve"] = Effect.fn("Comments.resolve")(
    function* (ticketId, commentId, resolved) {
      const { orgSlug, slug, userId } = yield* ProjectScope
      const root = yield* threadOf(orgSlug, slug, ticketId, commentId)
      const at = yield* DateTime.nowAsDate
      yield* updateBlocks(orgSlug, slug, ticketId, (blocks) =>
        blocks.map((block) =>
          block.id !== root.id
            ? block
            : !resolved
              ? withoutResolution(block)
              : block.resolvedBy === undefined
                ? { ...block, resolvedBy: userId, resolvedAt: at }
                : block
        )
      )
      const comment = (yield* list(ticketId)).find(
        (candidate) => candidate.id === root.id
      )
      if (comment === undefined) return yield* new NotFound()
      return comment
    }
  )

  const recordTicket: Comments["Service"]["recordTicket"] = Effect.fn(
    "Comments.recordTicket"
  )(function* (ticketId, commentId, created) {
    const { orgSlug, slug } = yield* ProjectScope
    let found = false
    yield* updateBlocks(orgSlug, slug, ticketId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== commentId) return block
        found = true
        return {
          ...block,
          tickets: [
            ...(block.tickets ?? []),
            `[${created}](${formatMentionHref("ticket", created)})`
          ]
        }
      })
    )
    if (!found) return yield* new NotFound()
  })

  const remove: Comments["Service"]["remove"] = Effect.fn("Comments.remove")(
    function* (ticketId, commentId) {
      const { orgSlug, slug } = yield* ProjectScope
      yield* authorizedComment(ticketId, commentId, CommentPolicy.canDelete)
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
    }
  )

  return Comments.of({
    list,
    create,
    importHistorical,
    edit,
    resolve,
    recordTicket,
    remove
  })
})

export const layer = Layer.effect(Comments, make)
