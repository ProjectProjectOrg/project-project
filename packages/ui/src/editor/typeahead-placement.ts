const EDGE_GAP = 8
const FLIP_GAP = 6

export type TypeaheadPlacementInput = Readonly<{
  anchorTop: number
  anchorLeft: number
  lineHeight: number
  menuWidth: number
  menuHeight: number
  viewport: Readonly<{
    top: number
    left: number
    width: number
    height: number
  }>
}>

export type TypeaheadPlacement = Readonly<{ top: number; left: number }>

export const placeTypeahead = ({
  anchorTop,
  anchorLeft,
  lineHeight,
  menuWidth,
  menuHeight,
  viewport
}: TypeaheadPlacementInput): TypeaheadPlacement => {
  const bottomEdge = viewport.top + viewport.height - EDGE_GAP
  const above = anchorTop - lineHeight - menuHeight - FLIP_GAP
  const flips = anchorTop + menuHeight > bottomEdge && above >= viewport.top
  const rightEdge = viewport.left + viewport.width - EDGE_GAP
  return {
    top: flips ? above : anchorTop,
    left: Math.max(
      viewport.left + EDGE_GAP,
      Math.min(anchorLeft, rightEdge - menuWidth)
    )
  }
}
