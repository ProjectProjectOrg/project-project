export const RAIL_SIZE = 20
const RAIL_GAP = 4
const RAIL_EDGE = 2

export type RailBounds = Readonly<{
  hostLeft: number
  textLeft: number
  clipLeft: number | null
}>

export const railLeft = ({
  hostLeft,
  textLeft,
  clipLeft
}: RailBounds): number | null => {
  const preferred = hostLeft - RAIL_GAP - RAIL_SIZE
  const left =
    clipLeft === null ? preferred : Math.max(preferred, clipLeft + RAIL_EDGE)
  return left + RAIL_SIZE > textLeft - RAIL_EDGE ? null : left - textLeft
}

const clipsHorizontally = (element: Element): boolean => {
  const overflow = getComputedStyle(element).overflowX
  return overflow !== "visible" && overflow !== ""
}

export const measureRailBounds = (
  anchor: HTMLElement,
  host: HTMLElement
): RailBounds => {
  let clip: Element | null = host.parentElement
  while (clip !== null && !clipsHorizontally(clip)) clip = clip.parentElement
  return {
    hostLeft: host.getBoundingClientRect().left,
    textLeft: anchor.getBoundingClientRect().left,
    clipLeft:
      clip === null ? null : clip.getBoundingClientRect().left + clip.clientLeft
  }
}

export const railHost = (anchor: HTMLElement): HTMLElement =>
  anchor.closest<HTMLElement>("[data-block-rail-host]") ??
  anchor.closest<HTMLElement>(".block-gutter") ??
  anchor

export const layoutTop = (element: HTMLElement, anchor: HTMLElement): number =>
  element.offsetParent === anchor
    ? element.offsetTop
    : element.getBoundingClientRect().top - anchor.getBoundingClientRect().top
