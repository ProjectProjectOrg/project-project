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

export type CommentsRequest = Readonly<{
  params: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
}>

export const commentsRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): CommentsRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: CommentsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type CommentViewRow = Readonly<{
  comment: Comment
  key: string
  pending: boolean
}>

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

export type CreateCommentKey = Readonly<{
  req: CommentsRequest
  clientId: string
  createdAt: Date
  author: User
}>

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
        Effect.fn("createComment")(function* (input: CreateCommentInput, get) {
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
  }: Readonly<{
    req: CommentsRequest
    commentId: CommentId
  }>) =>
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
          Effect.fn("editComment")(function* (input: UpdateCommentInput, get) {
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
  }: Readonly<{
    req: CommentsRequest
    commentId: CommentId
  }>) =>
    Atom.optimisticFn(comments(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) =>
          value.filter((row) => row.comment.id !== commentId)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("deleteComment")(function* (_input: void, get) {
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
