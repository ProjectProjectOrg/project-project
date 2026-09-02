export const PDF_SPREAD_PAGES = 3

export const PDF_SPREAD_PAGE_WIDTH = 116

export const PDF_SPREAD_PAGE_HEIGHT = 152

const RENDER_SCALE = 2

export const pdfSpreadScale = (unscaled: {
  readonly width: number
  readonly height: number
}): number => {
  if (!(unscaled.width > 0) || !(unscaled.height > 0)) return RENDER_SCALE
  const byWidth = (PDF_SPREAD_PAGE_WIDTH * RENDER_SCALE) / unscaled.width
  const byHeight = (PDF_SPREAD_PAGE_HEIGHT * RENDER_SCALE) / unscaled.height
  return Math.min(byWidth, byHeight)
}
