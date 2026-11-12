import type { TicketId } from "@pp/shared"

export type TicketSelection = Readonly<{
  keys: ReadonlySet<string>
  anchor: string | null
}>

export const emptySelection: TicketSelection = { keys: new Set(), anchor: null }

export const selectionKey = (slug: string, ticketId: TicketId): string =>
  `${slug}/${ticketId}`

const projectOf = (key: string) => key.slice(0, key.lastIndexOf("/"))

export const toggleSelection = (
  selection: TicketSelection,
  key: string,
  range?: ReadonlyArray<string>
): TicketSelection => {
  const project = projectOf(key)
  if ([...selection.keys].some((each) => projectOf(each) !== project)) {
    return { keys: new Set([key]), anchor: key }
  }
  const keys = new Set(selection.keys)
  const scoped = range?.filter((each) => projectOf(each) === project)
  const from =
    scoped !== undefined && selection.anchor !== null
      ? scoped.indexOf(selection.anchor)
      : -1
  const to = scoped?.indexOf(key) ?? -1
  if (scoped === undefined || from < 0 || to < 0) {
    if (keys.has(key)) keys.delete(key)
    else keys.add(key)
    return { keys, anchor: key }
  }
  const select = keys.has(scoped[from])
  for (const each of scoped.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (select) keys.add(each)
    else keys.delete(each)
  }
  return { keys, anchor: key }
}
