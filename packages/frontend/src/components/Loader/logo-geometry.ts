export const LOGO_GEOMETRY = {
  w: 100,
  h: 100,
  cy: 50,
  hTall: 44,
  hShort: 30
} as const

export type PanelGeometry = {
  foldX: number
  leftPath: string
  rightPath: string
  leftGradient: { x1: number; x2: number }
  rightGradient: { x1: number; x2: number }
}

const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p)

export function panelGeometry(p: number): PanelGeometry {
  const { w, cy, hTall, hShort } = LOGO_GEOMETRY
  const foldX = clamp01(p) * w
  const topTall = cy - hTall
  const botTall = cy + hTall
  const topShort = cy - hShort
  const botShort = cy + hShort

  const leftPath = `M 0 ${topTall} L ${foldX} ${topShort} L ${foldX} ${botShort} L 0 ${botTall} Z`
  const rightPath = `M ${foldX} ${topShort} L ${w} ${topTall} L ${w} ${botTall} L ${foldX} ${botShort} Z`

  return {
    foldX,
    leftPath,
    rightPath,
    leftGradient: { x1: foldX, x2: 0 },
    rightGradient: { x1: foldX, x2: w }
  }
}

export function logoSvgString(p: number): string {
  const { w, h } = LOGO_GEOMETRY
  const g = panelGeometry(p)
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="${g.leftGradient.x1}" y1="0" x2="${g.leftGradient.x2}" y2="0"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>
<linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="${g.rightGradient.x1}" y1="0" x2="${g.rightGradient.x2}" y2="0"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>
</defs>
<path d="${g.leftPath}" fill="url(#lg)"/>
<path d="${g.rightPath}" fill="url(#rg)"/>
</svg>`
}
