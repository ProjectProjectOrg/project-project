import {
  foldCenterY,
  gradientStops,
  LOGO_GEOMETRY,
  panelGeometry
} from "./logo-geometry"

type Trapezoid = [number, number][]

function fillPanel(
  ctx: CanvasRenderingContext2D,
  pts: Trapezoid,
  gx1: number,
  gx2: number,
  falloff: number,
  curve: number,
  sx: number,
  sy: number
) {
  const grad = ctx.createLinearGradient(gx1 * sx, 0, gx2 * sx, 0)
  for (const [offset, alpha] of gradientStops(falloff, curve)) {
    grad.addColorStop(offset, `rgba(255,255,255,${alpha})`)
  }
  ctx.fillStyle = grad
  ctx.beginPath()
  pts.forEach(([x, y], i) => {
    const px = x * sx
    const py = y * sy
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fill()
}

export function drawLogo(
  ctx: CanvasRenderingContext2D,
  p: number,
  persp: number,
  falloff: number,
  curve: number,
  w: number,
  h: number
): void {
  const { w: gw, h: gh, cy, hTall, hShort } = LOGO_GEOMETRY
  const sx = w / gw
  const sy = h / gh
  const { foldX, leftGradient, rightGradient } = panelGeometry(p, persp)
  const fcy = foldCenterY(persp)

  ctx.clearRect(0, 0, w, h)

  const left: Trapezoid = [
    [0, cy - hTall],
    [foldX, fcy - hShort],
    [foldX, fcy + hShort],
    [0, cy + hTall]
  ]
  const right: Trapezoid = [
    [foldX, fcy - hShort],
    [gw, cy - hTall],
    [gw, cy + hTall],
    [foldX, fcy + hShort]
  ]

  fillPanel(ctx, left, leftGradient.x1, leftGradient.x2, falloff, curve, sx, sy)
  fillPanel(
    ctx,
    right,
    rightGradient.x1,
    rightGradient.x2,
    falloff,
    curve,
    sx,
    sy
  )
}
