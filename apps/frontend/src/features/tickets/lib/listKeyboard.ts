export const listStep = (key: string): 1 | -1 | null =>
  key === "j" || key === "ArrowDown"
    ? 1
    : key === "k" || key === "ArrowUp"
      ? -1
      : null

export const stepTicket = <Id extends string>(
  sections: ReadonlyArray<ReadonlyArray<Id>>,
  current: string | null,
  step: 1 | -1
): Id | null => {
  const ids = sections.flat()
  const index = ids.findIndex((id) => id === current)
  if (index < 0) return ids[0] ?? null
  return ids[Math.min(Math.max(index + step, 0), ids.length - 1)] ?? null
}
