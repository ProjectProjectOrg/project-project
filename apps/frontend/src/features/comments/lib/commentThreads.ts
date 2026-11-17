import type { Comment } from "@pp/shared"

type Threaded = Readonly<{ comment: Pick<Comment, "id" | "replyTo"> }>

export type CommentThread<R extends Threaded> = Readonly<{
  root: R
  replies: ReadonlyArray<R>
}>

export const commentThreads = <R extends Threaded>(
  rows: ReadonlyArray<R>
): ReadonlyArray<CommentThread<R>> => {
  const ids = new Set(rows.map((row) => row.comment.id))
  const replies = new Map<string, Array<R>>()
  for (const row of rows) {
    const parent = row.comment.replyTo
    if (parent === null || !ids.has(parent)) continue
    replies.set(parent, [...(replies.get(parent) ?? []), row])
  }
  return rows.flatMap((row) =>
    row.comment.replyTo !== null && ids.has(row.comment.replyTo)
      ? []
      : [{ root: row, replies: replies.get(row.comment.id) ?? [] }]
  )
}
