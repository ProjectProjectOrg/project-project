import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  CommentId,
  CreateCommentInput,
  TicketId,
  UpdateCommentInput
} from "@projectproject/shared"

export const commentsKey = (orgSlug: string, slug: string, id: TicketId) =>
  `${orgSlug}/${slug}/${id}`

export const commentKey = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  commentId: CommentId
) => `${orgSlug}/${slug}/${id}/${commentId}`

const splitKey = (key: string) => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    id: parts.slice(2).join("/") as TicketId
  }
}

const splitCommentKey = (key: string) => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    id: parts[2] as TicketId,
    commentId: parts.slice(3).join("/") as CommentId
  }
}

const commentsBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.ticketComments.list({
          path: { orgSlug, slug, id }
        })
      })
    )
    .pipe(Atom.setIdleTTL("5 minutes"))
})

export const commentsAtom = Atom.family((key: string) =>
  Atom.optimistic(commentsBaseAtom(key))
)

export const createCommentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitKey(key)
  return Atom.optimisticFn(commentsAtom(key), {
    reducer: (current, _input: CreateCommentInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: CreateCommentInput, get) {
        const client = yield* ApiClient
        const created = yield* client.ticketComments.create({
          path: { orgSlug, slug, id },
          payload: input
        })
        get.refresh(commentsBaseAtom(key))
        return created
      })
    )
  })
})

export const editCommentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id, commentId } = splitCommentKey(key)
  const listKey = commentsKey(orgSlug, slug, id)
  return Atom.optimisticFn(commentsAtom(listKey), {
    reducer: (current, input: UpdateCommentInput) => {
      if (!Result.isSuccess(current)) return current
      const editedAt = new Date()
      const next = current.value.map((c) =>
        c.id === commentId ? { ...c, body: input.body, editedAt } : c
      )
      return Result.success([...next], { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: UpdateCommentInput, get) {
        const client = yield* ApiClient
        const updated = yield* client.ticketComments.update({
          path: { orgSlug, slug, id, commentId },
          payload: { body: input.body }
        })
        get.refresh(commentsBaseAtom(listKey))
        return updated
      })
    )
  })
})

export const deleteCommentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id, commentId } = splitCommentKey(key)
  const listKey = commentsKey(orgSlug, slug, id)
  return Atom.optimisticFn(commentsAtom(listKey), {
    reducer: (current, _input: void) => {
      if (!Result.isSuccess(current)) return current
      return Result.success(
        [...current.value.filter((c) => c.id !== commentId)],
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const client = yield* ApiClient
        yield* client.ticketComments.delete({
          path: { orgSlug, slug, id, commentId }
        })
        get.refresh(commentsBaseAtom(listKey))
        return commentId
      })
    )
  })
})
