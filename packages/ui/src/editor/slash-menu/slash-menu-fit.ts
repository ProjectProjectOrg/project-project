export type SlashMenuBounds = Readonly<{ left: number; right: number }>

export type SlashMenuSpan = Readonly<{ top: number; bottom: number }>

export type SlashMenuPlacement = Readonly<{
  side: "above" | "below"
  top: number
}>

export type SlashMenuFit = Readonly<{
  preview: boolean
  width: number
  offset: number
}>

export const SLASH_MENU_FULL_REM = 44
export const SLASH_MENU_LIST_REM = 28
export const SLASH_MENU_GUTTER = 8
export const SLASH_MENU_GAP = 4
export const SLASH_MENU_BODY_REM = 20

export const fitSlashMenu = ({
  anchorLeft,
  bounds,
  full,
  list
}: Readonly<{
  anchorLeft: number
  bounds: SlashMenuBounds
  full: number
  list: number
}>): SlashMenuFit => {
  const left = bounds.left + SLASH_MENU_GUTTER
  const right = bounds.right - SLASH_MENU_GUTTER
  const room = Math.max(0, right - left)
  const preview = room >= full
  const width = preview ? full : Math.min(list, room)
  const start = Math.max(left, Math.min(anchorLeft, right - width))
  return { preview, width, offset: start - anchorLeft }
}

export const slashMenuBounds = (root: HTMLElement | null): SlashMenuBounds => {
  const column = root?.closest<HTMLElement>("[data-scroll-root]")
  const viewport = { left: 0, right: window.innerWidth }
  if (column === null || column === undefined) return viewport
  const rect = column.getBoundingClientRect()
  return {
    left: Math.max(viewport.left, rect.left),
    right: Math.min(viewport.right, rect.right)
  }
}

export const placeSlashMenu = ({
  caret,
  height,
  bounds
}: Readonly<{
  caret: SlashMenuSpan
  height: number
  bounds: SlashMenuSpan
}>): SlashMenuPlacement => {
  const above = caret.top - SLASH_MENU_GAP - height
  return above >= bounds.top + SLASH_MENU_GUTTER
    ? { side: "above", top: above }
    : { side: "below", top: caret.bottom + SLASH_MENU_GAP }
}

export const slashMenuSpan = (root: HTMLElement | null): SlashMenuSpan => {
  const column = root?.closest<HTMLElement>("[data-scroll-root]")
  const viewport = { top: 0, bottom: window.innerHeight }
  if (column === null || column === undefined) return viewport
  const rect = column.getBoundingClientRect()
  return {
    top: Math.max(viewport.top, rect.top),
    bottom: Math.min(viewport.bottom, rect.bottom)
  }
}
