import {
  CommentId,
  Slug,
  type Comment,
  type CreateCommentInput,
  type TicketId,
  type UpdateCommentInput,
  type User
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { fireMutation, keepPredicted, viewMutation } from "@/api/viewMutation"
import { ticketContentKey } from "@/features/tickets/lib/ticketContent"

export type CommentsRequest = ReturnType<typeof commentsRequest>

export const commentsRequest = (orgSlug: string, slug: string, id: TicketId) =>
  ({
    _view: "comments",
    params: { orgSlug, slug, id }
  }) as const

const scopeOf = (req: CommentsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type CommentViewRow = Readonly<{
  comment: Comment
  key: string
  pending: boolean
  // Sending it failed: its outbox entry, waiting for Retry, Edit or Discard.
  failed: OutboxEntry | null
}>

// A comment that failed to send: kept, under the identity it was sent with,
// so it stays in its place in the thread until it's sent or discarded. In
// memory only; a reload drops it.
export type OutboxEntry = Readonly<{
  clientId: string
  createdAt: Date
  author: User
  input: CreateCommentInput
}>

export const commentOutbox = Atom.family((_req: CommentsRequest) =>
  Atom.make<ReadonlyArray<OutboxEntry>>([]).pipe(Atom.keepAlive)
)

const createdKeys = Atom.family((_req: CommentsRequest) =>
  Atom.make<ReadonlyMap<CommentId, string>>(new Map()).pipe(
    Atom.setIdleTTL("5 minutes")
  )
)

export const commentsQuery = (req: CommentsRequest) =>
  query("ticketComments", "list", {
    params: req.params,
    serializationKey: ticketContentKey(req.params),
    reactivityKeys: [
      Keys.comments(scopeOf(req), req.params.id),
      Keys.projectResync(scopeOf(req))
    ]
  })

const commentsView = (req: CommentsRequest) =>
  Atom.readable(
    (get) => {
      const identities = get(createdKeys(req))
      const outbox = get(commentOutbox(req))
      return AsyncResult.map(get(commentsQuery(req)), (value) => [
        ...value.map<CommentViewRow>((comment) => ({
          comment,
          key: identities.get(comment.id) ?? comment.id,
          pending: false,
          failed: null
        })),
        ...outbox.map<CommentViewRow>((entry) => ({
          comment: placeholderComment({ req, ...entry }, entry.input),
          key: entry.clientId,
          pending: false,
          failed: entry
        }))
      ])
    },
    (refresh) => refresh(commentsQuery(req))
  )

export const comments = Atom.family((req: CommentsRequest) =>
  Atom.optimistic(commentsView(req))
)

export type CreateCommentKey = Readonly<{
  req: CommentsRequest
  clientId: string
  createdAt: Date
  author: User
}>

const decodeCommentId = Schema.decodeUnknownSync(CommentId)
const decodeSlug = Schema.decodeUnknownSync(Slug)

const placeholderComment = (key: CreateCommentKey, input: CreateCommentInput) =>
  ({
    id: decodeCommentId(
      `c_${key.clientId.replaceAll(/[^A-Za-z0-9_-]/g, "_") || "pending"}`
    ),
    ticketId: key.req.params.id,
    projectSlug: decodeSlug(key.req.params.slug),
    author: { kind: "user", user: key.author },
    body: input.body,
    createdAt: key.createdAt,
    editedAt: null,
    replyTo: input.replyTo ?? null,
    resolution: null,
    tickets: [],
    origin: "native"
  }) satisfies Comment

export const createComment = Atom.family((key: CreateCommentKey) =>
  viewMutation(comments(key.req), {
    name: "createComment",
    predict: (value, input: CreateCommentInput) => [
      ...value,
      {
        comment: placeholderComment(key, input),
        key: key.clientId,
        pending: true,
        failed: null
      }
    ],
    call: (client, input, get) =>
      client.ticketComments
        .create({
          params: key.req.params,
          payload: input
        })
        .pipe(
          Effect.tap((created) =>
            Effect.sync(() => {
              const identities = createdKeys(key.req)
              get.set(
                identities,
                new Map(get(identities)).set(created.id, key.clientId)
              )
            })
          )
        ),
    confirm: (value, created) =>
      value.map((row) =>
        row.key === key.clientId
          ? {
              comment: created,
              key: key.clientId,
              pending: false,
              failed: null
            }
          : row
      ),
    publish: () => [Keys.ticketComments(scopeOf(key.req))]
  })
)

type CommentKey = Readonly<{
  req: CommentsRequest
  commentId: CommentId
}>

export const editComment = Atom.family(({ req, commentId }: CommentKey) =>
  viewMutation(comments(req), {
    name: "editComment",
    predict: (value, input: UpdateCommentInput) =>
      value.map((row) =>
        row.comment.id === commentId
          ? { ...row, comment: { ...row.comment, body: input.body } }
          : row
      ),
    call: (client, input) =>
      client.ticketComments.update({
        params: { ...req.params, commentId },
        payload: input
      }),
    confirm: (value, updated) =>
      value.map((row) =>
        row.comment.id === commentId
          ? { ...row, comment: updated, pending: false }
          : row
      ),
    publish: () => [Keys.ticketComments(scopeOf(req))]
  })
)

export const deleteComment = Atom.family(({ req, commentId }: CommentKey) =>
  viewMutation(comments(req), {
    name: "deleteComment",
    predict: (value, _input: void) =>
      value.filter((row) => row.comment.id !== commentId),
    call: (client) =>
      client.ticketComments
        .delete({
          params: { ...req.params, commentId }
        })
        .pipe(Effect.as(commentId)),
    confirm: keepPredicted,
    publish: () => [Keys.ticketComments(scopeOf(req))]
  })
)

type ResolveKey = Readonly<{
  req: CommentsRequest
  rootId: CommentId
  viewer: User | null
}>

export const resolveThread = Atom.family(
  ({ req, rootId, viewer }: ResolveKey) =>
    viewMutation(comments(req), {
      name: "resolveThread",
      predict: (value, resolved: boolean) =>
        value.map((row) =>
          row.comment.id === rootId
            ? {
                ...row,
                comment: {
                  ...row.comment,
                  resolution: resolved
                    ? (row.comment.resolution ?? {
                        by: viewer,
                        at: DateTime.toDate(DateTime.nowUnsafe())
                      })
                    : null
                }
              }
            : row
        ),
      call: (client, resolved) =>
        resolved
          ? client.ticketComments.resolve({
              params: { ...req.params, commentId: rootId }
            })
          : client.ticketComments.unresolve({
              params: { ...req.params, commentId: rootId }
            }),
      confirm: (value, root) =>
        value.map((row) =>
          row.comment.id === rootId ? { ...row, comment: root } : row
        ),
      publish: () => [Keys.ticketComments(scopeOf(req))]
    })
)

const withoutEntry = (outbox: ReadonlyArray<OutboxEntry>, clientId: string) =>
  outbox.filter((entry) => entry.clientId !== clientId)

// Keeps a send that failed in the thread, as a failed comment.
export const parkFailedComment = (
  registry: Registry.AtomRegistry,
  req: CommentsRequest,
  entry: OutboxEntry
) => {
  const outbox = commentOutbox(req)
  registry.set(outbox, [
    ...withoutEntry(registry.get(outbox), entry.clientId),
    entry
  ])
}

export const discardFailedComment = (
  registry: Registry.AtomRegistry,
  req: CommentsRequest,
  clientId: string
) => {
  const outbox = commentOutbox(req)
  registry.set(outbox, withoutEntry(registry.get(outbox), clientId))
}

// Sends a failed comment again under the identity it was first sent with,
// so it keeps its place; `body` sends edited text. A second failure parks it
// again.
export const retryFailedComment = async (
  registry: Registry.AtomRegistry,
  req: CommentsRequest,
  entry: OutboxEntry,
  body: string = entry.input.body
) => {
  const input = { ...entry.input, body }
  discardFailedComment(registry, req, entry.clientId)
  const result = await fireMutation(
    registry,
    createComment({
      req,
      author: entry.author,
      clientId: entry.clientId,
      createdAt: entry.createdAt
    }),
    input
  )
  if (!AsyncResult.isSuccess(result))
    parkFailedComment(registry, req, { ...entry, input })
}
