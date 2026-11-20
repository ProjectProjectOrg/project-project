import type { TicketId } from "@pp/shared"

export type TicketSelection = Readonly<{
  keys: ReadonlySet<string>
  anchor: string | null
}>

export const emptySelection: TicketSelection = { keys: new Set(), anchor: null }

export const selectionKey = (slug: string, ticketId: TicketId) =>
  `${slug}/${ticketId}`

export const projectOfKey = (key: string) => key.slice(0, key.lastIndexOf("/"))

export const toggleSelection = (
  selection: TicketSelection,
  key: string,
  range?: ReadonlyArray<string>
) => {
  const project = projectOfKey(key)
  if ([...selection.keys].some((each) => projectOfKey(each) !== project)) {
    return { keys: new Set([key]), anchor: key }
  }
  const keys = new Set(selection.keys)
  const scoped = range?.filter((each) => projectOfKey(each) === project)
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

export const selectAll = (
  selection: TicketSelection,
  order: ReadonlyArray<string>,
  pointed: string | null
) => {
  const [selected] = selection.keys
  const from = selected ?? pointed ?? order[0]
  if (from === undefined) return selection
  const project = projectOfKey(from)
  const keys = order.filter((key) => projectOfKey(key) === project)
  const anchor =
    selection.anchor !== null && keys.includes(selection.anchor)
      ? selection.anchor
      : (keys[0] ?? null)
  return { keys: new Set(keys), anchor }
}
