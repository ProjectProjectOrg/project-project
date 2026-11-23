export const draftSlots = (draftIndex: number) => ({
  ticketIndexOf: (slot: number) =>
    draftIndex >= 0 && slot > draftIndex ? slot - 1 : slot,
  slotIndexOf: (ticket: number) =>
    draftIndex >= 0 && ticket >= draftIndex ? ticket + 1 : ticket
})

export const withKeptIndexes = (
  indexes: Array<number>,
  kept: ReadonlyArray<number>
) => {
  const missing = kept.filter((index) => index >= 0 && !indexes.includes(index))
  return missing.length > 0
    ? [...indexes, ...missing].toSorted((a, b) => a - b)
    : indexes
}
