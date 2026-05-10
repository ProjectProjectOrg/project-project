import { Atom, Result } from "@effect-atom/atom-react"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import {
  commentKey,
  commentsKey,
  type CommentKey,
  type TicketKey
} from "@/atoms/keys"

export { commentKey, commentsKey }
export type { CommentKey }

const commentsBaseAtom = Atom.family(({ orgSlug, slug, id }: TicketKey) =>
  AppApiClient.query("ticketComments", "list", {
    path: { orgSlug, slug, id },
    reactivityKeys: [ReactivityKey.comments]
  })
)

export const commentsAtom = Atom.family((key: TicketKey) =>
  Atom.optimistic(commentsBaseAtom(key))
)

const createComment = AppApiClient.mutation("ticketComments", "create")
const updateComment = AppApiClient.mutation("ticketComments", "update")
const removeComment = AppApiClient.mutation("ticketComments", "delete")

export const createCommentAtom = Atom.family((key: TicketKey) =>
  commentsAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, _arg) =>
        Result.isSuccess(current)
          ? Result.success(current.value, { waiting: true })
          : current,
      fn: createComment
    })
  )
)

export const editCommentAtom = Atom.family((key: CommentKey) => {
  const listKey = commentsKey(key.orgSlug, key.slug, key.id)
  return commentsAtom(listKey).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const editedAt = new Date()
        const next = current.value.map((c) =>
          c.id === key.commentId
            ? { ...c, body: arg.payload.body, editedAt }
            : c
        )
        return Result.success([...next], { waiting: true })
      },
      fn: updateComment
    })
  )
})

export const deleteCommentAtom = Atom.family((key: CommentKey) => {
  const listKey = commentsKey(key.orgSlug, key.slug, key.id)
  return commentsAtom(listKey).pipe(
    Atom.optimisticFn({
      reducer: (current, _arg) => {
        if (!Result.isSuccess(current)) return current
        return Result.success(
          [...current.value.filter((c) => c.id !== key.commentId)],
          { waiting: true }
        )
      },
      fn: removeComment
    })
  )
})
