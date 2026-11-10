import * as Schema from "effect/Schema"

export const BoardColumnLayout = Schema.Struct({
  hidden: Schema.Array(Schema.String),
  collapsed: Schema.Array(Schema.String)
})
export type BoardColumnLayout = typeof BoardColumnLayout.Type

export const EMPTY_BOARD_LAYOUT: BoardColumnLayout = {
  hidden: [],
  collapsed: []
}

export function toggleSlug(
  slugs: ReadonlyArray<string>,
  slug: string
): ReadonlyArray<string> {
  return slugs.includes(slug)
    ? slugs.filter((s) => s !== slug)
    : [...slugs, slug]
}

export function visibleColumns<S extends string>(
  order: ReadonlyArray<S>,
  hidden: ReadonlyArray<string>
): ReadonlyArray<S> {
  return order.filter((slug) => !hidden.includes(slug))
}

export function canHide(
  order: ReadonlyArray<string>,
  hidden: ReadonlyArray<string>,
  slug: string
): boolean {
  if (hidden.includes(slug)) return true
  return visibleColumns(order, hidden).some((s) => s !== slug)
}
