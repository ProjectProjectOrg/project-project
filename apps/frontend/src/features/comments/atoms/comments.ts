import {
  CommentId,
  Slug,
  type Comment,
  type CreateCommentInput,
  type TicketId,
  type UpdateCommentInput,
  type User
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { keepPredicted, viewMutation } from "@/api/viewMutation"

export type CommentsRequest = Readonly<{
  _view: "comments"
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
): CommentsRequest => ({ _view: "comments", params: { orgSlug, slug, id } })

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
        value.map(
          (comment): CommentViewRow => ({
            comment,
            key: identities.get(comment.id) ?? comment.id,
            pending: false
          })
        )
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
  author: { kind: "user", user: key.author },
  body: input.body,
  createdAt: key.createdAt,
  editedAt: null,
  origin: "native"
})

export const createComment = Atom.family((key: CreateCommentKey) =>
  viewMutation(comments(key.req), {
    name: "createComment",
    predict: (value, input: CreateCommentInput) => [
      ...value,
      {
        comment: placeholderComment(key, input),
        key: key.clientId,
        pending: true
      }
    ],
    call: (input, get) =>
      Api.use((client) =>
        client.ticketComments.create({
          params: key.req.params,
          payload: input
        })
      ).pipe(
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
          ? { comment: created, key: key.clientId, pending: false }
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
    call: (input) =>
      Api.use((client) =>
        client.ticketComments.update({
          params: { ...req.params, commentId },
          payload: input
        })
      ),
    confirm: (value, updated) =>
      value.map((row) =>
        row.comment.id === commentId
          ? { ...row, comment: updated, pending: false }
          : row
      )
  })
)

export const deleteComment = Atom.family(({ req, commentId }: CommentKey) =>
  viewMutation(comments(req), {
    name: "deleteComment",
    predict: (value, _input: void) =>
      value.filter((row) => row.comment.id !== commentId),
    call: () =>
      Api.use((client) =>
        client.ticketComments.delete({
          params: { ...req.params, commentId }
        })
      ).pipe(Effect.as(commentId)),
    confirm: keepPredicted,
    publish: () => [Keys.ticketComments(scopeOf(req))]
  })
)
