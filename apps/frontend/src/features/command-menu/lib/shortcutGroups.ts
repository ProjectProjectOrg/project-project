type Listed = Readonly<{
  appHotkey: Readonly<{
    hotkey: unknown
    meta?: Readonly<{ group?: string }>
  }>
}>

export const shortcutGroups = <T extends Listed>(items: ReadonlyArray<T>) => {
  const groups = new Map<string, ReadonlyArray<T>>()
  for (const item of items) {
    if (item.appHotkey.hotkey === null) continue
    const group = item.appHotkey.meta?.group ?? ""
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  return [...groups].map(([group, entries]) => ({ group, items: entries }))
}
