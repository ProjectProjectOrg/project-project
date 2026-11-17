const FOLD_AFTER = 3
const KEEP_OPEN = 2

type Reply = Readonly<{ comment: Readonly<{ id: string }> }>

export const threadFold = <R extends Reply>({
  replies,
  manual,
  target,
  editing
}: Readonly<{
  replies: ReadonlyArray<R>
  manual: boolean | null
  target: string
  editing: ReadonlySet<string>
}>) => {
  const foldable =
    replies.length > FOLD_AFTER ? replies.slice(0, -KEEP_OPEN) : []
  const holds = (check: (id: string) => boolean) =>
    foldable.some((reply) => check(reply.comment.id))
  return {
    foldable,
    open:
      holds((id) => editing.has(id)) || (manual ?? holds((id) => id === target))
  }
}
