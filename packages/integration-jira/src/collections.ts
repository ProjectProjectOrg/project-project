export const groupBy = <A, B = A>(
  values: Iterable<A>,
  key: (value: A) => string,
  select: (value: A) => B = (value) => value as unknown as B
): Map<string, Array<B>> => {
  const grouped = new Map<string, Array<B>>()
  for (const value of values) {
    const group = grouped.get(key(value))
    if (group) group.push(select(value))
    else grouped.set(key(value), [select(value)])
  }
  return grouped
}

export const countBy = (keys: Iterable<string>): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}
