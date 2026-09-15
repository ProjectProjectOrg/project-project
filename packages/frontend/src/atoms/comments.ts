import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import {
  CommentId,
  Slug,
  type Comment,
  type CreateCommentInput,
  type TicketId,
  type UpdateCommentInput,
  type User
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface CommentsRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: TicketId
  }
}

export const commentsRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): CommentsRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: CommentsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export interface CommentViewRow {
  readonly comment: Comment
  readonly key: string
  readonly pending: boolean
}

const createdKeys = Atom.family((_req: CommentsRequest) =>
  Atom.make<ReadonlyMap<CommentId, string>>(new Map()).pipe(
    Atom.setIdleTTL("5 minutes")
  )
)

const commentsQuery = (req: CommentsRequest) =>
  Api.query("ticketComments", "list", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.comments(scopeOf(req), req.params.id)]
  })

const commentsView = (req: CommentsRequest) =>
  Atom.readable(
    (get) => {
      const identities = get(createdKeys(req))
      return AsyncResult.map(get(commentsQuery(req)), (value) =>
        value.map((comment): CommentViewRow => ({
          comment,
          key: identities.get(comment.id) ?? comment.id,
          pending: false
        }))
      )
    },
    (refresh) => refresh(commentsQuery(req))
  )

export const comments = Atom.family((req: CommentsRequest) =>
  Atom.optimistic(commentsView(req))
)

export interface CreateCommentKey {
  readonly req: CommentsRequest
  readonly clientId: string
  readonly createdAt: Date
  readonly author: User
}

const decodeCommentId = Schema.decodeUnknownSync(CommentId)
const decodeSlug = Schema.decodeUnknownSync(Slug)

const placeholderComment = (
  key: CreateCommentKey,
  input: CreateCommentInput
): Comment => ({
  id: decodeCommentId(
    `c_${key.clientId.replaceAll(/[^A-Za-z0-9_-]/g, "_") || "pending"}`
  ),
  ticketId: key.req.params.id,
  projectSlug: decodeSlug(key.req.params.slug),
  author: key.author,
  body: input.body,
  createdAt: key.createdAt,
  editedAt: null
})

export const createComment = Atom.family((key: CreateCommentKey) =>
  Atom.optimisticFn(comments(key.req), {
    reducer: (current, input: CreateCommentInput) =>
      AsyncResult.map(current, (value) => [
        ...value,
        {
          comment: placeholderComment(key, input),
          key: key.clientId,
          pending: true
        }
      ]),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: CreateCommentInput, get) {
          const created = yield* Api.use((client) =>
            client.ticketComments.create({
              params: key.req.params,
              payload: input
            })
          )
          const identities = createdKeys(key.req)
          get.set(
            identities,
            new Map(get(identities)).set(created.id, key.clientId)
          )
          set(
            AsyncResult.map(get(comments(key.req)), (value) =>
              value.map((row) =>
                row.key === key.clientId
                  ? { comment: created, key: key.clientId, pending: false }
                  : row
              )
            )
          )
          return created
        })
      )
  })
)

export const editComment = Atom.family(
  ({
    req,
    commentId
  }: {
    readonly req: CommentsRequest
    readonly commentId: CommentId
  }) =>
    Atom.optimisticFn(comments(req), {
      reducer: (current, input: UpdateCommentInput) =>
        AsyncResult.map(current, (value) =>
          value.map((row) =>
            row.comment.id === commentId
              ? { ...row, comment: { ...row.comment, body: input.body } }
              : row
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: UpdateCommentInput, get) {
            const updated = yield* Api.use((client) =>
              client.ticketComments.update({
                params: { ...req.params, commentId },
                payload: input
              })
            )
            set(
              AsyncResult.map(get(comments(req)), (value) =>
                value.map((row) =>
                  row.comment.id === commentId
                    ? { ...row, comment: updated, pending: false }
                    : row
                )
              )
            )
            return updated
          })
        )
    })
)

export const deleteComment = Atom.family(
  ({
    req,
    commentId
  }: {
    readonly req: CommentsRequest
    readonly commentId: CommentId
  }) =>
    Atom.optimisticFn(comments(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) =>
          value.filter((row) => row.comment.id !== commentId)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.ticketComments.delete({
                params: { ...req.params, commentId }
              })
            )
            set(AsyncResult.map(get(comments(req)), (value) => value))
            return commentId
          })
        )
    })
)
