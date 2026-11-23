export type RailPoint = Readonly<{ x: number; y: number }>

// The bend's corner radius, and how far from a mark's centre it ends: half a
// 20px mark, so it reaches the mark's top edge and leaves its bottom edge.
const RADIUS = 8
const GAP = 10
// The corners are the design system's corner-shape superellipse(1.5):
// |x|^n + |y|^n = 1 with n = 2^1.5, traced in STEPS points per corner.
const EXPONENT = 2 / 2 ** 1.5
const STEPS = 10

const quarter = (turn: (c: number, s: number) => RailPoint) =>
  Array.from({ length: STEPS }, (_, i) => {
    const theta = ((i + 1) / STEPS) * (Math.PI / 2)
    return turn(Math.cos(theta) ** EXPONENT, Math.sin(theta) ** EXPONENT)
  })

// From (x0, top) over to x1: a corner turning across, a short straight and a
// corner turning down again. A partial indent (a fold half open) gets a
// smaller radius, so the bend never overshoots.
export const railBend = (x0: number, x1: number, top: number) => {
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
export const railPath = (points: ReadonlyArray<RailPoint>) =>
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
// from the point before the fold to its own place, as far as the most
// closed fold around it is open. Closed, it sits on the mark before it (or
// after it, when nothing comes before), so the rail is exactly what it was
// without it; open, it's where it belongs.
const openOf = (clip: HTMLElement) =>
  clip.scrollHeight > 0
    ? Math.min(1, clip.getBoundingClientRect().height / clip.scrollHeight)
    : 1

const closestClip = (node: HTMLElement, root: HTMLElement) => {
  let clip: HTMLElement | null = null
  let open = 1
  for (
    let around = node.closest<HTMLElement>("[data-rail-clip]");
    around !== null && root.contains(around);
    around =
      around.parentElement?.closest<HTMLElement>("[data-rail-clip]") ?? null
  ) {
    const opened = openOf(around)
    if (clip === null || opened < open) {
      clip = around
      open = opened
    }
  }
  return { clip, open }
}

const toward = (from: RailPoint, to: RailPoint, open: number) => ({
  x: from.x + (to.x - from.x) * open,
  y: from.y + (to.y - from.y) * open
})

export const railPoints = (root: HTMLElement) => {
  const box = root.getBoundingClientRect()
  const marks = [...root.querySelectorAll<HTMLElement>("[data-rail-node]")].map(
    (node) => {
      const r = node.getBoundingClientRect()
      const { clip, open } = closestClip(node, root)
      return {
        at: {
          x: r.left + r.width / 2 - box.left,
          y: r.top + r.height / 2 - box.top
        },
        clip,
        open
      }
    }
  )
  const leading = marks.findIndex((mark) => mark.clip === null)
  const lead = leading === -1 ? 0 : leading
  const points: Array<RailPoint> = marks.map((mark) => mark.at)
  const origins = new Map<HTMLElement, RailPoint>()
  for (let index = lead + 1; index < marks.length; index++) {
    const { at, clip, open } = marks[index]
    const prev = points[index - 1]
    if (clip === null) continue
    const origin = origins.get(clip) ?? prev
    origins.set(clip, origin)
    points[index] = {
      x: toward(origin, at, open).x,
      y: toward(prev, at, open).y
    }
  }
  for (let index = lead - 1; index >= 0; index--) {
    const { at, open } = marks[index]
    points[index] = toward(points[index + 1], at, open)
  }
  return points
}
