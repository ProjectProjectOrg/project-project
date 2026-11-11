export type SearchPage<A> = Readonly<{
  items: ReadonlyArray<A>
  nextCursor: string | null
}>

export const appendPage = <A extends Readonly<{ id: string }>>(
  loaded: SearchPage<A>,
  next: SearchPage<A>
): SearchPage<A> => {
  const seen = new Set(loaded.items.map((item) => item.id))
  return {
    items: [
      ...loaded.items,
      ...next.items.filter((item) => !seen.has(item.id))
    ],
    nextCursor: next.nextCursor
  }
}
