import * as Schema from "effect/Schema"

export const ListEdit = <S extends Schema.Top>(item: S) =>
  Schema.Union([
    Schema.Array(item),
    Schema.Struct({
      add: Schema.optional(Schema.Array(item)),
      remove: Schema.optional(Schema.Array(item))
    })
  ])

export type ListEdit<A> =
  | ReadonlyArray<A>
  | Readonly<{ add?: ReadonlyArray<A>; remove?: ReadonlyArray<A> }>

const isReplacement = <A>(edit: ListEdit<A>): edit is ReadonlyArray<A> =>
  Array.isArray(edit)

export const applyListEdit = <A>(
  current: ReadonlyArray<A>,
  edit: ListEdit<A>
): ReadonlyArray<A> => {
  if (isReplacement(edit)) return [...new Set(edit)]
  const remove = new Set(edit.remove)
  const kept = current.filter((value) => !remove.has(value))
  return [...new Set([...kept, ...(edit.add ?? [])])]
}

export const composeListEdit = <A>(
  first: ListEdit<A>,
  then: ListEdit<A>
): ListEdit<A> => {
  if (isReplacement(then)) return then
  if (isReplacement(first)) return applyListEdit(first, then)
  const added = new Set(then.add)
  const removed = new Set(then.remove)
  return {
    add: [
      ...new Set([
        ...(first.add ?? []).filter((value) => !removed.has(value)),
        ...added
      ])
    ],
    remove: [
      ...new Set([
        ...(first.remove ?? []).filter((value) => !added.has(value)),
        ...removed
      ])
    ]
  }
}

export const listEditAdds = <A>(edit: ListEdit<A>): ReadonlyArray<A> =>
  isReplacement(edit) ? edit : (edit.add ?? [])

export const listEditBetween = <A>(
  before: ReadonlyArray<A>,
  after: ReadonlyArray<A>
): ListEdit<A> => ({
  add: after.filter((value) => !before.includes(value)),
  remove: before.filter((value) => !after.includes(value))
})
