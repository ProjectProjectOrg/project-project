export type RailPoint = Readonly<{ x: number; y: number }>

// The bend's corner radius, and how far from a mark's centre it ends: half a
// 20px mark, so it reaches the mark's top edge and leaves its bottom edge.
const RADIUS = 8
const GAP = 10
// The corners are the design system's corner-shape superellipse(1.5):
// |x|^n + |y|^n = 1 with n = 2^1.5, traced in STEPS points per corner.
const EXPONENT = 2 / 2 ** 1.5
const STEPS = 10

const quarter = (
  turn: (c: number, s: number) => RailPoint
): ReadonlyArray<RailPoint> =>
  Array.from({ length: STEPS }, (_, i) => {
    const theta = ((i + 1) / STEPS) * (Math.PI / 2)
    return turn(Math.cos(theta) ** EXPONENT, Math.sin(theta) ** EXPONENT)
  })

// From (x0, top) over to x1: a corner turning across, a short straight and a
// corner turning down again. A partial indent (a fold half open) gets a
// smaller radius, so the bend never overshoots.
export const railBend = (
  x0: number,
  x1: number,
  top: number
): ReadonlyArray<RailPoint> => {
  const dir = Math.sign(x1 - x0)
  const r = Math.min(RADIUS, Math.abs(x1 - x0) / 2)
  return [
    ...quarter((c, s) => ({ x: x0 + dir * r - dir * r * c, y: top + r * s })),
    { x: x1 - dir * r, y: top + r },
    ...quarter((c, s) => ({
      x: x1 - dir * r + dir * r * s,
      y: top + 2 * r - r * c
    }))
  ]
}

// The rail through the marks, top to bottom: straight down within a column,
// and where the column changes, one bend. Going in, the bend ends just above
// the first indented mark; coming out, it starts just below the last one.
export const railPath = (points: ReadonlyArray<RailPoint>): string =>
  points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      const prev = points[i - 1] ?? p
      if (Math.abs(prev.x - p.x) < 0.5) return `L ${p.x} ${p.y}`
      const height = Math.min(2 * RADIUS, Math.abs(p.x - prev.x))
      const room = Math.max(0, p.y - prev.y - height)
      const top =
        p.x > prev.x
          ? prev.y + Math.max(0, room - GAP)
          : prev.y + Math.min(GAP, room)
      const corners = railBend(prev.x, p.x, top)
        .map((q) => `L ${q.x.toFixed(2)} ${q.y.toFixed(2)}`)
        .join(" ")
      return `L ${prev.x} ${top} ${corners} L ${p.x} ${p.y}`
    })
    .join(" ")

// Where each mark sits on the rail, relative to the rail's box. A mark
// inside a fold or a box that is opening (data-rail-clip) travels with it:
// from the mark before it to its own place, as far as the fold is open, and
// the indent the fold itself adds (data-rail-indent, or its rows' left
// padding) eases in the same way. Closed, it sits on the mark before it, so
// the rail is exactly what it was without it; open, it's where it belongs.
// Nothing jumps when a fold mounts or unmounts.
export const railPoints = (root: HTMLElement): ReadonlyArray<RailPoint> => {
  const box = root.getBoundingClientRect()
  const points: Array<RailPoint> = []
  for (const node of root.querySelectorAll<HTMLElement>("[data-rail-node]")) {
    const r = node.getBoundingClientRect()
    const x = r.left + r.width / 2 - box.left
    const y = r.top + r.height / 2 - box.top
    const clip = node.closest<HTMLElement>("[data-rail-clip]")
    const prev = points.at(-1)
    if (!clip || !root.contains(clip) || prev === undefined) {
      points.push({ x, y })
      continue
    }
    const c = clip.getBoundingClientRect()
    const open =
      clip.scrollHeight > 0 ? Math.min(1, c.height / clip.scrollHeight) : 1
    const rows = clip.firstElementChild
    const given = clip.dataset.railIndent
    const step =
      given !== undefined
        ? Number.parseFloat(given) || 0
        : rows instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(rows).paddingLeft) || 0
          : 0
    points.push({
      x: x - step * (1 - open),
      y: prev.y + (y - prev.y) * open
    })
  }
  return points
}
