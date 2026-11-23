import type { Comment } from "@pp/shared"

import { commentAuthorName } from "./commentClipboard"

const FOLD_AFTER = 3
const KEEP_OPEN = 2

type Reply = Readonly<{ comment: Readonly<{ id: string }> }>

export const threadFold = <R extends Reply>({
  replies,
  resolved,
  manual,
  target,
  editing,
  held
}: Readonly<{
  replies: ReadonlyArray<R>
  resolved: boolean
  manual: boolean | null
  target: string
  editing: ReadonlySet<string>
  // At most this many fold (what folded when you started replying), until
  // the thread is resolved.
  held: number | null
}>) => {
  const folds = resolved
    ? replies.slice(0, -1)
    : replies.length > FOLD_AFTER
      ? replies.slice(0, -KEEP_OPEN)
      : []
  const foldable = held === null || resolved ? folds : folds.slice(0, held)
  const holds = (check: (id: string) => boolean) =>
    foldable.some((reply) => check(reply.comment.id))
  return {
    foldable,
    open:
      holds((id) => editing.has(id)) || (manual ?? holds((id) => id === target))
  }
}

export const foldedAuthors = (
  comments: ReadonlyArray<Pick<Comment, "author">>,
  locale: string
) => ({
  people: [
    ...new Map(
      comments.flatMap((comment) =>
        comment.author.kind === "user"
          ? [[comment.author.user.id, comment.author.user] as const]
          : []
      )
    ).values()
  ],
  names: new Intl.ListFormat(locale, { type: "conjunction" }).format([
    ...new Set(comments.map((comment) => commentAuthorName(comment.author)))
  ])
})
